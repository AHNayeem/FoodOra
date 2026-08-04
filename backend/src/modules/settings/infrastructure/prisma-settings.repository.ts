import { Injectable } from '@nestjs/common';

import { enumCodec, TransactionManager } from '../../../infrastructure/prisma';
import type { $Enums } from '../../../infrastructure/prisma/generated';
import type { SettingScope, SettingValueType } from '../../../shared/enums';
import type { NewSetting, SettingRecord, SettingsRepositoryPort } from '../domain';

const scopes = enumCodec<SettingScope, $Enums.SettingScope>('SettingScope');
const valueTypes = enumCodec<SettingValueType, $Enums.SettingValueType>('SettingValueType');

const FIELDS = {
  id: true,
  scope: true,
  scopeId: true,
  key: true,
  valueType: true,
  value: true,
  isPublic: true,
  description: true,
  updatedAt: true,
  updatedBy: true,
} as const;

interface SettingRow {
  id: string;
  scope: string;
  scopeId: string | null;
  key: string;
  valueType: string;
  value: unknown;
  isPublic: boolean;
  description: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

@Injectable()
export class PrismaSettingsRepository implements SettingsRepositoryPort {
  constructor(private readonly transactions: TransactionManager) {}

  private get db() {
    return this.transactions.client;
  }

  async listAll(): Promise<SettingRecord[]> {
    const rows = await this.db.setting.findMany({
      orderBy: [{ key: 'asc' }, { scope: 'asc' }],
      select: FIELDS,
    });
    return rows.map(toRecord);
  }

  /**
   * `findFirst`, not `findUnique`, and for two reasons that both matter.
   *
   * `scopeId` is nullable and part of the unique constraint, so Prisma's compound-unique input
   * cannot carry `null` for it — the generated type demands a string. And naming `deletedAt` in
   * the `where` is what opts out of the soft-delete filter, which this needs: clearing a setting
   * tombstones the row, and the *next* write has to find that row rather than colliding with it
   * on the unique index.
   */
  async findExact(
    key: string,
    scope: SettingScope,
    scopeId: string | null,
  ): Promise<SettingRecord | null> {
    const row = await this.db.setting.findFirst({
      where: { key, scope: scopes.toDb(scope), scopeId, deletedAt: null },
      select: FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  /**
   * Write the row at one exact scope, creating it if it is absent and reviving it if it was
   * cleared.
   *
   * Find-then-write rather than `upsert` for the same nullable-key reason as above. The revive is
   * the subtle part: `remove()` soft-deletes, the unique index covers tombstones, and setting a
   * value that was previously cleared is an ordinary thing for an operator to do — so the write
   * has to clear `deletedAt` rather than fail on a row nobody can see.
   *
   * `value` goes in as JSON. The cast is confined to this one line and is safe because
   * `SettingsService` has already checked the value against the key's declared `valueType`:
   * nothing reaches here that is not a string, a finite number, a boolean, or a plain object.
   */
  async upsert(input: NewSetting): Promise<SettingRecord> {
    const scope = scopes.toDb(input.scope);
    const value = input.value as object;

    const existing = await this.db.setting.findFirst({
      where: { key: input.key, scope, scopeId: input.scopeId, deletedAt: undefined },
      select: { id: true },
    });

    const shared = {
      valueType: valueTypes.toDb(input.valueType),
      value,
      isPublic: input.isPublic,
      description: input.description,
      updatedBy: input.updatedBy,
    };

    const row = existing
      ? await this.db.setting.update({
          where: { id: existing.id },
          data: { ...shared, deletedAt: null },
          select: FIELDS,
        })
      : await this.db.setting.create({
          data: { id: input.id, scope, scopeId: input.scopeId, key: input.key, ...shared },
          select: FIELDS,
        });

    return toRecord(row);
  }

  /**
   * `softDelete` rather than `deleteMany`: `Setting` carries a `deletedAt`, so the
   * extension refuses a hard delete on it (see `soft-delete.extension.ts`). That is the
   * right behaviour here for a reason beyond consistency — the unique index covers
   * tombstones, so a hard delete followed by a re-add would work while a *restore* would
   * collide. Clearing an override and setting it again is a thing operators do, so the
   * upsert above has to be able to find the row it once wrote.
   */
  async remove(key: string, scope: SettingScope, scopeId: string | null): Promise<boolean> {
    const { count } = (await this.db.setting.softDelete({
      where: { key, scope: scopes.toDb(scope), scopeId },
    })) as { count: number };
    return count > 0;
  }
}

function toRecord(row: SettingRow): SettingRecord {
  return {
    ...row,
    scope: scopes.toWire(row.scope),
    valueType: valueTypes.toWire(row.valueType),
  };
}
