import type { SettingScope, SettingValueType } from '../../../shared/enums';

/**
 * One configured row. `scopeId` is a country code for `country`, a vendor id for
 * `vendor`, and null for `platform` — which is why the schema deliberately has **no FK
 * on it** (D2 §Setting): the column holds two different kinds of reference, so integrity
 * is this module's job rather than the database's. `SettingsService` checks it.
 */
export interface SettingRecord {
  id: string;
  scope: SettingScope;
  scopeId: string | null;
  key: string;
  valueType: SettingValueType;
  value: unknown;
  isPublic: boolean;
  description: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface NewSetting {
  id: string;
  scope: SettingScope;
  scopeId: string | null;
  key: string;
  valueType: SettingValueType;
  value: unknown;
  isPublic: boolean;
  description: string | null;
  updatedBy: string | null;
}

/**
 * A resolved key, with the provenance of the answer.
 *
 * `scope` is what makes an admin screen honest: an operator looking at a vendor's
 * settings needs to see which values that vendor actually set and which are inherited,
 * or every field looks like a local override and "reset to default" has no meaning.
 */
export interface ResolvedSetting {
  key: string;
  valueType: SettingValueType;
  value: unknown;
  /** Which layer answered. `platform` with `isDefault` means the catalogue did. */
  scope: SettingScope;
  isDefault: boolean;
  isPublic: boolean;
  description: string | null;
}
