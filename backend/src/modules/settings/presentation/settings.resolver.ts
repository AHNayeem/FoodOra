import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { Permissions, Public } from '../../../common/decorators';
import { JSONObjectScalar } from '../../../common/scalars';
import { zodPipe } from '../../../common/pipes';
import { type DataPayload, toPayload } from '../../../graphql';
import { mapResult } from '../../../shared/kernel';
import { SettingsService } from '../application/settings.service';
import { type ResolvedSetting, SETTINGS_CATALOGUE, type SettingRecord } from '../domain';
import {
  ClearSettingInput,
  ClearSettingSchema,
  SettingScopeInput,
  WriteSettingInputType,
  WriteSettingSchema,
} from './inputs/setting.inputs';
import {
  SettingDefinitionModel,
  SettingModel,
  SettingOverrideModel,
  SettingPayload,
} from './models/setting.models';

/**
 * Configuration: one public query, and the admin surface behind it.
 *
 * `publicSettings` is `@Public()` and returns only keys the catalogue marks public. That
 * split is why `isPublic` is a property of the *key* rather than of the row — the
 * boundary between "the storefront may render this" and "only an operator may see it" is
 * declared once, in code, and cannot be widened by an admin filling in a form.
 */
@Resolver()
export class SettingsResolver {
  constructor(private readonly settings: SettingsService) {}

  // --- public ---------------------------------------------------------------

  @Public()
  @Query(() => JSONObjectScalar, {
    name: 'publicSettings',
    description:
      'Every public key, resolved for a country. A flat map — read it once at boot, not per component.',
  })
  async publicSettings(
    @Args('countryCode', { type: () => String, nullable: true }) countryCode?: string | null,
  ): Promise<Record<string, unknown>> {
    return this.settings.readPublic({ countryCode });
  }

  // --- admin ----------------------------------------------------------------

  @Permissions('settings:read')
  @Query(() => [SettingModel], {
    name: 'settings',
    description: 'Every declared key resolved for a scope, including operator-only ones.',
  })
  async settingsFor(
    @Args('scope', { type: () => SettingScopeInput, nullable: true }) scope?: SettingScopeInput,
  ): Promise<SettingModel[]> {
    const resolved = await this.settings.resolvedFor({
      countryCode: scope?.countryCode ?? null,
      vendorId: scope?.vendorId ?? null,
    });
    return resolved.map(toSettingModel);
  }

  @Permissions('settings:read')
  @Query(() => [SettingOverrideModel], {
    name: 'settingOverrides',
    description: 'Rows that actually exist — what has been overridden, and where.',
  })
  async settingOverrides(): Promise<SettingOverrideModel[]> {
    const rows = await this.settings.configuredRows();
    return rows.map(toOverrideModel);
  }

  /**
   * The catalogue itself. Needs no database, which is the point: an admin screen can
   * render its whole form on a platform where nothing has ever been configured.
   */
  @Permissions('settings:read')
  @Query(() => [SettingDefinitionModel], {
    name: 'settingDefinitions',
    description: 'Keys the platform declares, with their defaults and overridable scopes.',
  })
  settingDefinitions(): SettingDefinitionModel[] {
    return SETTINGS_CATALOGUE.map((definition) => ({
      key: definition.key,
      valueType: definition.valueType,
      defaultValue: { value: definition.defaultValue },
      isPublic: definition.isPublic,
      scopes: [...definition.scopes],
      description: definition.description,
    }));
  }

  @Permissions('settings:write')
  @Mutation(() => SettingPayload, { description: 'Set a setting at platform, country or vendor scope.' })
  async setSetting(
    @Args('input', zodPipe(WriteSettingSchema)) input: WriteSettingInputType,
  ): Promise<DataPayload<SettingModel>> {
    const result = await this.settings.write({
      key: input.key,
      scope: input.scope,
      scopeId: input.scopeId ?? null,
      value: input.value.value,
    });
    return toPayload(mapResult(result, toSettingModel));
  }

  @Permissions('settings:write')
  @Mutation(() => SettingPayload, {
    description: 'Remove an override. The key falls back to the layer above it.',
  })
  async clearSetting(
    @Args('input', zodPipe(ClearSettingSchema)) input: ClearSettingInput,
  ): Promise<DataPayload<SettingModel>> {
    const result = await this.settings.clear(input.key, input.scope, input.scopeId ?? null);
    return toPayload(mapResult(result, toSettingModel));
  }
}

function toSettingModel(resolved: ResolvedSetting): SettingModel {
  return { ...resolved, value: { value: resolved.value } };
}

function toOverrideModel(row: SettingRecord): SettingOverrideModel {
  return {
    id: row.id,
    key: row.key,
    scope: row.scope,
    scopeId: row.scopeId,
    valueType: row.valueType,
    value: { value: row.value },
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}
