export const SettingError = {
  /** Not in the catalogue. Writing an undeclared key would create a row nobody reads. */
  unknownKey: 'settings.errors.unknownKey',
  /** Declared, but not overridable at the scope the caller asked for. */
  scopeNotAllowed: 'settings.errors.scopeNotAllowed',
  /** A `country` write needs a country code, a `vendor` write a vendor id. */
  scopeIdRequired: 'settings.errors.scopeIdRequired',
  scopeIdForbidden: 'settings.errors.scopeIdForbidden',
  unknownScopeTarget: 'settings.errors.unknownScopeTarget',
  /** The JSON does not match the key's declared `valueType`. */
  invalidValue: 'settings.errors.invalidValue',
  /** No row at that exact scope — so there is nothing to clear. */
  notConfigured: 'settings.errors.notConfigured',
} as const;

export type SettingErrorKey = (typeof SettingError)[keyof typeof SettingError];
