import type { SettingScope, SettingValueType } from '../../../../shared/enums';
import { SETTINGS_CATALOGUE, settingDefinition } from '../catalogue';
import type { ResolvedSetting, SettingRecord } from '../models';

/**
 * Setting resolution, as one pure function.
 *
 * ```
 * vendor row → country row → platform row → catalogue default
 * ```
 *
 * First hit wins, and the catalogue is always last, which is what guarantees that every
 * declared key resolves against an empty table.
 *
 * Pure for the same reason the authorization algebra is: "what is this value?" is
 * consulted by every module and is very easy to get subtly wrong at the edges — a
 * `false` that should override a `true` default, a `0` that looks absent. Both of those
 * are here as explicit cases rather than as `||` chains, and both are testable with four
 * literals and no database.
 */

/** Rows for one key, in any order, plus the scope being resolved for. */
export interface ResolutionLayers {
  rows: readonly SettingRecord[];
  countryCode?: string | null;
  vendorId?: string | null;
}

/** Most specific first. `resolveOne` walks this order and stops at the first match. */
const PRECEDENCE: readonly SettingScope[] = ['vendor', 'country', 'platform'];

function matches(row: SettingRecord, layers: ResolutionLayers): boolean {
  switch (row.scope) {
    case 'vendor':
      return Boolean(layers.vendorId) && row.scopeId === layers.vendorId;
    case 'country':
      return Boolean(layers.countryCode) && row.scopeId === layers.countryCode;
    case 'platform':
      return true;
  }
}

export function resolveOne(key: string, layers: ResolutionLayers): ResolvedSetting | null {
  const definition = settingDefinition(key);
  if (!definition) return null;

  const candidates = layers.rows.filter((row) => row.key === key && matches(row, layers));

  for (const scope of PRECEDENCE) {
    const row = candidates.find((candidate) => candidate.scope === scope);
    if (!row) continue;

    /**
     * A row whose stored value does not match the declared type is **skipped**, not
     * returned and not thrown on. It can only exist if the catalogue's `valueType`
     * changed after the row was written — a deploy-ordering artefact — and in that
     * situation falling through to the next layer gives a working system with one
     * ignored override, where the alternatives are a crash on every read or a value of
     * the wrong shape reaching arithmetic. Reporting it is `SettingsService`'s job; the
     * pure function only has to be safe.
     */
    if (!valueMatchesType(row.value, definition.valueType)) continue;

    return {
      key,
      valueType: definition.valueType,
      value: row.value,
      scope: row.scope,
      isDefault: false,
      isPublic: definition.isPublic,
      description: definition.description,
    };
  }

  return {
    key,
    valueType: definition.valueType,
    value: definition.defaultValue,
    scope: 'platform',
    isDefault: true,
    isPublic: definition.isPublic,
    description: definition.description,
  };
}

/** Every catalogue key, resolved. The admin screen's whole payload in one pass. */
export function resolveAll(layers: ResolutionLayers): ResolvedSetting[] {
  return SETTINGS_CATALOGUE.map((definition) => resolveOne(definition.key, layers)).filter(
    (resolved): resolved is ResolvedSetting => resolved !== null,
  );
}

/**
 * Does this JSON value match the declared type?
 *
 * `null` fails every type including `json`. A setting that resolves to null is
 * indistinguishable from one that is absent at every call site that reads it, so
 * allowing it would create a third state — "configured to nothing" — that no consumer
 * has a branch for. Clearing a setting is `deleteSetting`, which is unambiguous.
 */
export function valueMatchesType(value: unknown, valueType: SettingValueType): boolean {
  switch (valueType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'json':
      // Objects and arrays. A bare scalar would be valid JSON but would mean the key was
      // declared as the wrong type, which is worth catching rather than accepting.
      return typeof value === 'object' && value !== null;
  }
}
