import type { SettingScope } from '../../../../shared/enums';
import type { NewSetting, SettingRecord } from '../models';

export const SETTINGS_REPOSITORY = Symbol('SETTINGS_REPOSITORY');

export interface SettingsRepositoryPort {
  /**
   * Every configured row, unfiltered.
   *
   * There is deliberately no `layersFor(scope)` query. Resolution needs three layers at
   * once (vendor, its country, the platform), so a scoped query would be three `OR`
   * branches to avoid a round trip per layer — and the whole table is a few hundred rows
   * of configuration that is read on every request and written a few times a month. One
   * query, cached whole, resolved in memory by a pure function, is both faster and the
   * only version where two layers cannot be cached at different moments and disagree.
   */
  listAll(): Promise<SettingRecord[]>;

  /** The row at one exact scope, if any. Read before a write, to know what changed. */
  findExact(
    key: string,
    scope: SettingScope,
    scopeId: string | null,
  ): Promise<SettingRecord | null>;

  upsert(input: NewSetting): Promise<SettingRecord>;

  /** False when there was no row at that exact scope — nothing to clear. */
  remove(key: string, scope: SettingScope, scopeId: string | null): Promise<boolean>;
}
