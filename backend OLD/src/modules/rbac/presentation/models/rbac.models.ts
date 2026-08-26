import { Field, Int, ObjectType } from '@nestjs/graphql';

import { DateTimeScalar } from '../../../../common/scalars';
import { payloadOf, UserRoleScalar } from '../../../../graphql';
import type { UserRole } from '../../../../shared/enums';

@ObjectType('Role', { description: 'A role: a named bundle of catalogue permissions.' })
export class RoleModel {
  @Field(() => String) id!: string;
  @Field(() => String, { description: 'Kebab-case. Matches `UserRole` for a built-in.' })
  slug!: string;
  @Field(() => String) name!: string;
  @Field(() => String) description!: string;

  @Field(() => UserRoleScalar, {
    nullable: true,
    description: 'Set for the fourteen built-ins, so a client can map role → slug directly.',
  })
  builtin!: UserRole | null;

  @Field(() => Boolean, {
    description: 'Built-ins cannot be renamed, re-ranked or deleted — only their permissions change.',
  })
  isSystem!: boolean;

  @Field(() => Int, {
    description:
      'Higher wins. Also the gate on administration: you may only act on roles strictly below your own highest rank.',
  })
  rank!: number;

  @Field(() => [String], { description: 'Catalogue permission slugs this role carries.' })
  permissions!: string[];

  @Field(() => Int, { description: 'How many accounts hold it. A role in use cannot be deleted.' })
  assignedCount!: number;

  @Field(() => DateTimeScalar) createdAt!: Date;
  @Field(() => DateTimeScalar) updatedAt!: Date;
}

@ObjectType('Permission', { description: 'One capability, e.g. "orders:accept".' })
export class PermissionModel {
  @Field(() => String, { description: 'Empty when the row has not been synced yet.' })
  id!: string;
  @Field(() => String) slug!: string;
  @Field(() => String, { description: 'Grouping for the admin matrix, e.g. "orders".' })
  resource!: string;
  @Field(() => String) action!: string;
  @Field(() => String) description!: string;

  @Field(() => Boolean, {
    description:
      'False for a row whose slug has left shared/permissions.ts — it is granted but nothing enforces it.',
  })
  inCatalogue!: boolean;
}

@ObjectType('RoleAssignment', { description: 'A role held by an account, optionally scoped to one vendor.' })
export class RoleAssignmentModel {
  @Field(() => String) id!: string;
  @Field(() => String) userId!: string;
  @Field(() => String) roleSlug!: string;
  @Field(() => String) roleName!: string;

  @Field(() => String, { nullable: true, description: 'Null = platform-wide.' })
  vendorId!: string | null;

  @Field(() => DateTimeScalar) grantedAt!: Date;
  @Field(() => String, { nullable: true }) grantedBy!: string | null;
  @Field(() => DateTimeScalar, { nullable: true }) expiresAt!: Date | null;
}

@ObjectType('DirectGrant', { description: 'A permission granted or denied directly on one account.' })
export class DirectGrantModel {
  @Field(() => String) id!: string;
  @Field(() => String) userId!: string;
  @Field(() => String) permissionSlug!: string;

  @Field(() => Boolean, { description: 'false = an explicit denial, which beats every role grant.' })
  effect!: boolean;

  @Field(() => String, { nullable: true }) vendorId!: string | null;
  @Field(() => DateTimeScalar) grantedAt!: Date;
  @Field(() => String, { nullable: true }) grantedBy!: string | null;
  @Field(() => DateTimeScalar, { nullable: true }) expiresAt!: Date | null;
}

/**
 * "Why can this person do that?"
 *
 * Worth its own type because PBAC's answer is not visible in any single table: an account
 * can hold a role that grants a permission and a direct denial that removes it, and no view
 * of either row alone explains the outcome. This shows the inputs next to the result.
 */
@ObjectType('UserAuthorization', { description: 'Everything granted to one account, and the resolved result.' })
export class UserAuthorizationModel {
  @Field(() => String) userId!: string;
  @Field(() => UserRoleScalar) primaryRole!: UserRole;
  @Field(() => [RoleAssignmentModel]) assignments!: RoleAssignmentModel[];
  @Field(() => [DirectGrantModel]) directGrants!: DirectGrantModel[];

  @Field(() => [String], {
    description: 'role grants ∪ direct grants − direct denials. `["*"]` for a super-admin.',
  })
  effectivePermissions!: string[];
}

export const RolePayload = payloadOf(RoleModel, 'RolePayload');
export const RoleAssignmentPayload = payloadOf(RoleAssignmentModel, 'RoleAssignmentPayload');
export const DirectGrantPayload = payloadOf(DirectGrantModel, 'DirectGrantPayload');
