/**
 * The settings module's published contract.
 *
 * Later modules normally reach settings through `SETTINGS_READER` in
 * `shared/contracts` — a two-method interface that needs no knowledge of this module at
 * all. What is exported here is for the admin surface and for the reference-data script:
 * the catalogue itself, so a screen can render every declared key whether or not anybody
 * has configured it.
 */
export {
  catalogueDefaults,
  isSettingKey,
  scopeAllowed,
  SETTING_KEYS,
  type SettingDefinition,
  type SettingKey,
  SETTINGS_CATALOGUE,
  settingDefinition,
} from './catalogue';
export type { NewSetting, ResolvedSetting, SettingRecord } from './models';
export {
  resolveAll,
  resolveOne,
  type ResolutionLayers,
  valueMatchesType,
} from './policies/setting-resolution';
export { SETTINGS_CACHE, type SettingsCachePort } from './ports/settings-cache.port';
export { SETTINGS_REPOSITORY, type SettingsRepositoryPort } from './ports/settings.repository.port';
export { SettingError, type SettingErrorKey } from './settings-errors';
