import type { SettingScope, SettingValueType } from '../../../shared/enums';

/**
 * The declared settings catalogue.
 *
 * `Setting` is a key/value table with a `Json` column, which is the right storage and
 * the wrong contract. Without a catalogue there is no answer to three questions the
 * system needs answered constantly:
 *
 * - **What does this key resolve to when nobody has configured it?** Every later module
 *   reads settings — E5 wants a cancellation window, E7 a retry count — and none of them
 *   can afford `undefined` on the first request after a fresh migration. The default here
 *   *is* the last resolution layer, so a key always resolves.
 * - **How should the JSON be read?** `value: 15` and `value: "15"` are both valid JSON.
 *   The type is declared once, by the platform, rather than inferred from whatever the
 *   last writer happened to send.
 * - **Which keys may a client see?** `isPublic` is a property of the key, not of the row.
 *   Leaving it to the writer means one careless admin edit exposes an operator-only value
 *   through the public query.
 *
 * `scopes` is where a key may be *overridden*. Most things are platform-wide; a few are
 * genuinely per-market (`orders.minOrderValue` differs between Dhaka and Berlin) and a
 * few per-vendor. Declaring it means a vendor cannot set a platform-only key by guessing
 * its name, which is the same closed-catalogue argument as `shared/permissions.ts`.
 */
export interface SettingDefinition {
  /** Dotted, e.g. `"orders.cancelWindowMinutes"`. */
  key: string;
  valueType: SettingValueType;
  /** Resolved when no row exists at any scope. Must match `valueType`. */
  defaultValue: unknown;
  /** May a client read it? Operator-only keys are false. */
  isPublic: boolean;
  /** Scopes a row may be written at. `platform` is always implied. */
  scopes: readonly SettingScope[];
  description: string;
}

const PLATFORM_ONLY: readonly SettingScope[] = ['platform'];
const PER_COUNTRY: readonly SettingScope[] = ['platform', 'country'];
const PER_VENDOR: readonly SettingScope[] = ['platform', 'country', 'vendor'];

export const SETTINGS_CATALOGUE = [
  // --- what the storefront needs before anybody signs in ---------------------
  {
    key: 'platform.name',
    valueType: 'string',
    defaultValue: 'FoodOra',
    isPublic: true,
    scopes: PER_COUNTRY,
    description: 'Display name in titles, receipts and transactional mail.',
  },
  {
    key: 'platform.supportEmail',
    valueType: 'string',
    defaultValue: 'support@foodora.app',
    isPublic: true,
    scopes: PER_COUNTRY,
    description: 'Where "contact us" goes. Per-country so a local team can own its inbox.',
  },
  {
    key: 'platform.supportPhone',
    valueType: 'string',
    defaultValue: '',
    isPublic: true,
    scopes: PER_COUNTRY,
    description: 'Shown on the help page and on receipts. Empty hides it.',
  },
  {
    key: 'platform.maintenanceMode',
    valueType: 'boolean',
    defaultValue: false,
    isPublic: true,
    scopes: PER_COUNTRY,
    description:
      'Public, deliberately: a client that cannot read this cannot render the maintenance page, and a 503 with no explanation is worse than a planned one.',
  },

  // --- account rules --------------------------------------------------------
  {
    key: 'accounts.allowRegistration',
    valueType: 'boolean',
    defaultValue: true,
    isPublic: true,
    scopes: PER_COUNTRY,
    description: 'Per-country, so a market can be prepared before it opens to signups.',
  },
  {
    key: 'accounts.requireEmailVerification',
    valueType: 'boolean',
    defaultValue: false,
    isPublic: true,
    scopes: PER_COUNTRY,
    description: 'Whether an unverified account may order. Enforced in E5, read here.',
  },
  {
    key: 'accounts.retentionDaysAfterClose',
    valueType: 'number',
    defaultValue: 30,
    isPublic: false,
    scopes: PLATFORM_ONLY,
    description:
      'How long a closed account is recoverable before the purge job may remove it. Operator-only: it is a legal commitment, not a preference.',
  },

  // --- read by later phases, declared now so they have a default -------------
  {
    key: 'orders.cancelWindowMinutes',
    valueType: 'number',
    defaultValue: 5,
    isPublic: true,
    scopes: PER_VENDOR,
    description:
      'How long after placing an order a customer may cancel it themselves. Per-vendor because a kitchen that starts immediately cannot honour five minutes. Enforced in E5.',
  },
  {
    key: 'orders.minOrderValue',
    valueType: 'number',
    defaultValue: 0,
    isPublic: true,
    scopes: PER_VENDOR,
    description: 'Basket floor in the vendor’s currency. 0 disables it. Enforced in E5.',
  },
  {
    key: 'notifications.digestHourLocal',
    valueType: 'number',
    defaultValue: 9,
    isPublic: false,
    scopes: PER_COUNTRY,
    description:
      'Local hour the weekly digest is sent. Per-country because "local" means the country’s timezone. Used in E8.',
  },
] as const satisfies readonly SettingDefinition[];

export type SettingKey = (typeof SETTINGS_CATALOGUE)[number]['key'];

const BY_KEY = new Map<string, SettingDefinition>(
  SETTINGS_CATALOGUE.map((definition) => [definition.key, definition]),
);

export function settingDefinition(key: string): SettingDefinition | undefined {
  return BY_KEY.get(key);
}

export function isSettingKey(key: string): key is SettingKey {
  return BY_KEY.has(key);
}

export const SETTING_KEYS: readonly SettingKey[] = SETTINGS_CATALOGUE.map(
  (definition) => definition.key,
);

/** Whether a key may be written at a scope. `platform` is always allowed. */
export function scopeAllowed(key: string, scope: SettingScope): boolean {
  const definition = BY_KEY.get(key);
  if (!definition) return false;
  return scope === 'platform' || definition.scopes.includes(scope);
}

/** The catalogue defaults as a resolved map — the bottom layer of every resolution. */
export function catalogueDefaults(): Record<string, unknown> {
  return Object.fromEntries(
    SETTINGS_CATALOGUE.map((definition) => [definition.key, definition.defaultValue]),
  );
}
