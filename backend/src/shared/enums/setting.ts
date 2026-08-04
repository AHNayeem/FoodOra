/**
 * Configurable settings (D2 §Setting).
 *
 * Resolution narrows outward-in: a vendor's value beats its country's, which beats
 * the platform's. The order of `SETTING_SCOPES` is that precedence, most specific
 * first, and `resolveSettings()` depends on it.
 */
export const SETTING_SCOPES = ['vendor', 'country', 'platform'] as const;

export type SettingScope = (typeof SETTING_SCOPES)[number];

/** How the `Json` column is to be read. Declared per key by the catalogue. */
export const SETTING_VALUE_TYPES = ['string', 'number', 'boolean', 'json'] as const;

export type SettingValueType = (typeof SETTING_VALUE_TYPES)[number];
