import type { SettingRecord } from '../models';

export const SETTINGS_CACHE = Symbol('SETTINGS_CACHE');

/**
 * Caches the **rows**, not the resolved answers.
 *
 * Resolution depends on the scope being asked about, so caching resolved maps would need
 * one entry per (country × vendor) pair — thousands of entries holding the same handful
 * of rows, each with its own chance of being missed on invalidation. Caching the rows and
 * resolving in memory means one entry, one `del` on write, and resolution is a pure
 * function over an array that costs nothing to run per request.
 */
export interface SettingsCachePort {
  read(): Promise<SettingRecord[] | null>;
  write(rows: readonly SettingRecord[]): Promise<void>;
  invalidate(): Promise<void>;
}
