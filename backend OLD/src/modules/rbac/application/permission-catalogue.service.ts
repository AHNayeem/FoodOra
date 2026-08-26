import { Inject, Injectable, Logger } from '@nestjs/common';

import { IdService } from '../../../common/ids';
import { PERMISSION_CATALOGUE } from '../../../shared/permissions';
import { ok, type Result } from '../../../shared/kernel';
import {
  type PermissionRecord,
  type PermissionUpsert,
  ROLE_REPOSITORY,
  type RoleRepositoryPort,
} from '../domain';

/**
 * Reconciles `shared/permissions.ts` into the `permissions` table.
 *
 * The direction of authority is the whole design: **code declares what capabilities
 * exist; the database records who holds them.** So this only ever writes code → table,
 * and it never deletes.
 *
 * Not deleting is the important half. A permission row that has left the catalogue may
 * still be referenced by a role or a direct grant, and `RolePermission` /`UserPermission`
 * both cascade on delete — so removing the row would silently revoke somebody's access
 * because a slug was renamed in a commit. Orphans instead come back from
 * `listPermissions()` with `inCatalogue: false`, where an operator can see that a
 * permission they granted enforces nothing, and decide.
 *
 * Why a mutation rather than a boot-time sync: E1's rule is that an unreachable Postgres
 * must not stop the process from starting. A `syncPermissions` in `onModuleInit` would
 * either violate that or swallow its own failure, and a schema write on every pod start is
 * a migration pretending to be a lifecycle hook.
 */
@Injectable()
export class PermissionCatalogueService {
  private readonly logger = new Logger(PermissionCatalogueService.name);

  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepositoryPort,
    private readonly ids: IdService,
  ) {}

  /**
   * The table joined with the catalogue.
   *
   * Rows the table is missing are included as *unsynced* entries rather than omitted, so
   * the admin matrix shows every capability the software has, with the ones needing a sync
   * visibly marked. A matrix that only lists synced rows would look complete while missing
   * whatever the last deploy added.
   */
  async list(): Promise<PermissionRecord[]> {
    const rows = await this.roles.listPermissions();
    const known = new Set(rows.map((row) => row.slug));

    const unsynced: PermissionRecord[] = PERMISSION_CATALOGUE.filter(
      (definition) => !known.has(definition.slug),
    ).map((definition) => ({
      // No row, therefore no id. Empty rather than a fabricated one: an admin screen that
      // tries to grant this should fail loudly at the mutation, which refuses a slug with
      // no row, rather than write a grant against an id that does not exist.
      id: '',
      slug: definition.slug,
      resource: definition.resource,
      action: definition.action,
      description: definition.description,
      inCatalogue: true,
    }));

    return [...rows, ...unsynced].sort(
      (a, b) => a.resource.localeCompare(b.resource) || a.action.localeCompare(b.action),
    );
  }

  /** Creates missing rows and refreshes descriptions. Returns how many were written. */
  async sync(): Promise<Result<number>> {
    const definitions: PermissionUpsert[] = PERMISSION_CATALOGUE.map((definition) => ({
      id: this.ids.next('permission'),
      slug: definition.slug,
      resource: definition.resource,
      action: definition.action,
      description: definition.description,
    }));

    const written = await this.roles.syncPermissions(definitions);
    this.logger.log(`Permission catalogue synced: ${written} of ${definitions.length} rows written.`);
    return ok(written);
  }
}
