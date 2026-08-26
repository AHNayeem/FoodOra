import { Module, type OnModuleInit } from '@nestjs/common';

import { assertVocabularyMatches } from '../../infrastructure/prisma';
import { USER_ROLES, USER_STATUSES } from '../../shared/enums';
import { AssignmentService } from './application/assignment.service';
import { PermissionCatalogueService } from './application/permission-catalogue.service';
import { PermissionService } from './application/permission.service';
import { RoleAdminService } from './application/role-admin.service';
import {
  AUTHORIZATION_CACHE,
  BUILTIN_ROLES,
  PERMISSION_RESOLUTION,
  RBAC_REPOSITORY,
  ROLE_REPOSITORY,
} from './domain';
import { PrismaRbacRepository } from './infrastructure/prisma-rbac.repository';
import { PrismaRoleRepository } from './infrastructure/prisma-role.repository';
import { RedisAuthorizationCache } from './infrastructure/redis-authorization-cache';
import { RbacResolver } from './presentation/rbac.resolver';

/**
 * Roles and permissions, resolution and administration.
 *
 * E2 shipped only the read side, because a guard needs an answer and nothing yet needed a
 * screen. E3 adds the write side next to it, which is the right place for it: the rule that
 * "a denial beats a grant" is enforced by `resolveAuthorization`, and the mutation that
 * writes a denial has to be maintained by whoever maintains that.
 */
@Module({
  providers: [
    PermissionService,
    RoleAdminService,
    AssignmentService,
    PermissionCatalogueService,
    RbacResolver,
    { provide: RBAC_REPOSITORY, useClass: PrismaRbacRepository },
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    { provide: AUTHORIZATION_CACHE, useClass: RedisAuthorizationCache },
    // The published contract. Siblings inject the token; only this line knows which class
    // is behind it.
    { provide: PERMISSION_RESOLUTION, useExisting: PermissionService },
  ],
  exports: [PERMISSION_RESOLUTION],
})
export class RbacModule implements OnModuleInit {
  /**
   * The `shared/enums` unions and the Postgres enums are two hand-maintained lists of the
   * same facts, and this is the seam where they could drift — a role added to the schema but
   * not the union would be silently unmappable on the first user who held it. Checking at
   * boot turns that into a failure with a diff in it.
   *
   * E3 adds a third list to keep aligned: `BUILTIN_ROLES` names every slug and gives it a
   * rank, and a role present in the enum but absent from that table would resolve to rank 0
   * — which would make it administrable by anybody. Silently. So the boot checks the
   * *coverage* too, not only the enum.
   */
  onModuleInit(): void {
    assertVocabularyMatches('UserRoleSlug', USER_ROLES);
    assertVocabularyMatches('UserStatus', USER_STATUSES);

    const ranked = new Set(BUILTIN_ROLES.map((role) => role.slug));
    const missing = USER_ROLES.filter((slug) => !ranked.has(slug));
    if (missing.length > 0) {
      throw new Error(
        `BUILTIN_ROLES is missing a rank for: ${missing.join(', ')}. ` +
          'An unranked role resolves to rank 0, which anybody could administer.',
      );
    }
  }
}
