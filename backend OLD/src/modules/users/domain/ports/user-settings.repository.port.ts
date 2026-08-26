import type { CustomerSettings } from '../models';

export const USER_SETTINGS_REPOSITORY = Symbol('USER_SETTINGS_REPOSITORY');

/**
 * `UserSettings` (the privacy and security flags) and `NotificationPreference` (one row per
 * topic) behind one port, because `frontend/types/settings.ts::CustomerSettings` is one
 * object and the seam's job is to keep it that way.
 *
 * The split in the database is not arbitrary: the notification matrix is a table so a topic
 * can be added without migrating every row's JSON (D2 §UserSettings). That is the right
 * storage and the wrong shape for a settings page, so the mapping lives here.
 */
export interface UserSettingsRepositoryPort {
  /**
   * Never null: an account with no rows resolves to the defaults, because every read of a
   * nullable settings object would otherwise need the same branch, and the defaults are
   * already in the schema.
   */
  read(userId: string): Promise<CustomerSettings>;

  /** Writes the whole object — the caller has already merged and enforced. */
  write(userId: string, settings: CustomerSettings): Promise<CustomerSettings>;
}
