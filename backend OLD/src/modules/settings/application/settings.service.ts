import { Inject, Injectable, Logger } from '@nestjs/common';

import { RequestContextService } from '../../../common/context';
import { IdService } from '../../../common/ids';
import type { SettingsReaderPort, SettingScopeRef } from '../../../shared/contracts';
import type { SettingScope } from '../../../shared/enums';
import { fail, ok, type Result } from '../../../shared/kernel';
import { REGION_CATALOG, type RegionCatalogPort } from '../../regions/domain';
import {
  type ResolvedSetting,
  resolveAll,
  resolveOne,
  scopeAllowed,
  SETTINGS_CACHE,
  type SettingsCachePort,
  SETTINGS_REPOSITORY,
  type SettingRecord,
  type SettingsRepositoryPort,
  SettingError,
  settingDefinition,
  valueMatchesType,
} from '../domain';

export interface WriteSettingInput {
  key: string;
  scope: SettingScope;
  /** Country code for `country`, vendor id for `vendor`, null for `platform`. */
  scopeId: string | null;
  value: unknown;
}

/**
 * Reads and writes configured settings, and the implementation behind `SETTINGS_READER`.
 *
 * The read path is the one that matters, because every later module is on it. Three
 * properties it has to hold:
 *
 * **It always answers.** A catalogue key resolves against an empty table, an unreachable
 * Redis, and — via `catalogueDefaults` — a `settings` table that has never been seeded.
 * Configuration that only works once configured is a landmine under the first deploy.
 *
 * **A read is never a failure.** If the rows cannot be fetched, the resolution falls
 * through to the catalogue and logs. `read()` returning the default is a system running
 * with defaults; `read()` throwing is a checkout page that 500s because Redis blipped.
 *
 * **Writes are validated against the catalogue, not against the caller.** An undeclared
 * key, a value of the wrong type, a vendor-scoped write to a platform-only key — all
 * refused as `Result` failures with an i18n key, before a row exists that nothing will
 * ever read.
 */
@Injectable()
export class SettingsService implements SettingsReaderPort {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @Inject(SETTINGS_REPOSITORY) private readonly repository: SettingsRepositoryPort,
    @Inject(SETTINGS_CACHE) private readonly cache: SettingsCachePort,
    @Inject(REGION_CATALOG) private readonly regions: RegionCatalogPort,
    private readonly context: RequestContextService,
    private readonly ids: IdService,
  ) {}

  // --- SETTINGS_READER ------------------------------------------------------

  /**
   * One typed value.
   *
   * Throws only for a key outside the catalogue, which is a programming error rather than
   * a runtime condition — the alternative is returning `undefined` for a typo and letting
   * it surface three layers away as `NaN`.
   */
  async read<T>(key: string, scope: SettingScopeRef = {}): Promise<T> {
    const definition = settingDefinition(key);
    if (!definition) {
      throw new Error(
        `"${key}" is not in the settings catalogue. Declare it in modules/settings/domain/catalogue.ts.`,
      );
    }

    const rows = await this.rows();
    const resolved = resolveOne(key, { rows, ...scope });
    return (resolved?.value ?? definition.defaultValue) as T;
  }

  async readPublic(scope: SettingScopeRef = {}): Promise<Record<string, unknown>> {
    const rows = await this.rows();
    return Object.fromEntries(
      resolveAll({ rows, ...scope })
        .filter((resolved) => resolved.isPublic)
        .map((resolved) => [resolved.key, resolved.value]),
    );
  }

  // --- admin reads ----------------------------------------------------------

  /** Every declared key, resolved for a scope, with the provenance of each answer. */
  async resolvedFor(scope: SettingScopeRef = {}): Promise<ResolvedSetting[]> {
    return resolveAll({ rows: await this.rows(), ...scope });
  }

  /** The rows that actually exist, so an admin can see what has been overridden where. */
  async configuredRows(): Promise<SettingRecord[]> {
    return this.rows();
  }

  // --- writes ---------------------------------------------------------------

  async write(input: WriteSettingInput): Promise<Result<ResolvedSetting>> {
    const definition = settingDefinition(input.key);
    if (!definition) {
      return fail(SettingError.unknownKey, { path: 'input.key', params: { key: input.key } });
    }

    if (!scopeAllowed(input.key, input.scope)) {
      return fail(SettingError.scopeNotAllowed, {
        path: 'input.scope',
        params: { key: input.key, scope: input.scope, allowed: [...definition.scopes] },
      });
    }

    const scopeId = await this.checkScopeId(input.scope, input.scopeId);
    if (!scopeId.ok) return scopeId;

    if (!valueMatchesType(input.value, definition.valueType)) {
      return fail(SettingError.invalidValue, {
        path: 'input.value',
        params: { key: input.key, expected: definition.valueType },
      });
    }

    const existing = await this.repository.findExact(input.key, input.scope, scopeId.data);

    await this.repository.upsert({
      // Reuse the row's id on an update so history, if anyone ever attaches any, follows
      // the setting rather than each edit of it.
      id: existing?.id ?? this.ids.next('setting'),
      key: input.key,
      scope: input.scope,
      scopeId: scopeId.data,
      valueType: definition.valueType,
      value: input.value,
      // Taken from the catalogue, never from the caller. `isPublic` is a property of the
      // key; letting a writer set it means one careless edit exposes an operator-only
      // value through the public query.
      isPublic: definition.isPublic,
      description: definition.description,
      updatedBy: this.context.get()?.actor?.id ?? null,
    });

    await this.cache.invalidate();

    // Re-resolve rather than echo the write: at vendor scope the answer the caller will
    // actually get depends on layers above it, and showing them their own input as though
    // it were the resolved value is how "I saved it and nothing changed" happens.
    const rows = await this.repository.listAll();
    const resolved = resolveOne(input.key, {
      rows,
      countryCode: input.scope === 'country' ? scopeId.data : null,
      vendorId: input.scope === 'vendor' ? scopeId.data : null,
    });
    return resolved ? ok(resolved) : fail(SettingError.unknownKey);
  }

  /** Remove an override, so the key falls back to the layer above it. */
  async clear(
    key: string,
    scope: SettingScope,
    scopeId: string | null,
  ): Promise<Result<ResolvedSetting>> {
    if (!settingDefinition(key)) {
      return fail(SettingError.unknownKey, { params: { key } });
    }

    const checked = await this.checkScopeId(scope, scopeId);
    if (!checked.ok) return checked;

    const removed = await this.repository.remove(key, scope, checked.data);
    if (!removed) return fail(SettingError.notConfigured, { params: { key, scope } });

    await this.cache.invalidate();

    const rows = await this.repository.listAll();
    const resolved = resolveOne(key, {
      rows,
      countryCode: scope === 'country' ? checked.data : null,
      vendorId: scope === 'vendor' ? checked.data : null,
    });
    return resolved ? ok(resolved) : fail(SettingError.unknownKey);
  }

  // --- internals ------------------------------------------------------------

  /**
   * `scopeId` integrity, which the database cannot enforce: the column holds a country
   * code or a vendor id depending on `scope`, so there is no FK to hang on it
   * (D2 §Setting notes exactly this).
   *
   * The country case is checked against the catalogue. The vendor case is **not** —
   * vendors arrive in E4, and validating an id against a table that does not have a
   * module yet would mean either a stub or a cross-module reach into Prisma. A
   * vendor-scoped row with a bad id resolves for nobody, which is inert rather than
   * dangerous, and E4 tightens it.
   */
  private async checkScopeId(scope: SettingScope, scopeId: string | null): Promise<Result<string | null>> {
    if (scope === 'platform') {
      if (scopeId) return fail(SettingError.scopeIdForbidden, { path: 'input.scopeId' });
      return ok(null);
    }

    if (!scopeId) return fail(SettingError.scopeIdRequired, { path: 'input.scopeId' });

    if (scope === 'country') {
      const country = await this.regions.activeCountry(scopeId);
      if (!country) {
        return fail(SettingError.unknownScopeTarget, {
          path: 'input.scopeId',
          params: { scopeId },
        });
      }
      return ok(country.code);
    }

    return ok(scopeId);
  }

  /** Cached rows, falling back to the database, falling back to nothing. */
  private async rows(): Promise<SettingRecord[]> {
    const cached = await this.cache.read();
    if (cached) return cached;

    try {
      const rows = await this.repository.listAll();
      await this.cache.write(rows);
      return rows;
    } catch (error) {
      // Every declared key still resolves — to its catalogue default. A platform running
      // on defaults is a degraded platform; one that throws on `read()` is a broken one.
      this.logger.warn(
        `Settings unavailable, resolving from catalogue defaults: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }
}
