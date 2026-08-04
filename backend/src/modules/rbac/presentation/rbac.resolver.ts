import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { Actor } from '../../../common/context';
import { CurrentUser, Permissions } from '../../../common/decorators';
import { UnauthenticatedError } from '../../../common/errors';
import { zodPipe } from '../../../common/pipes';
import { type DataPayload, MutationResult, toPayload, toResult } from '../../../graphql';
import { AssignmentService } from '../application/assignment.service';
import { PermissionCatalogueService } from '../application/permission-catalogue.service';
import { RoleAdminService } from '../application/role-admin.service';
import type {
  AuthorizationDetail,
  RbacActor,
  RoleAssignmentRecord,
  RoleRecord,
  UserPermissionRecord,
} from '../domain';
import {
  AssignRoleInputType,
  AssignRoleSchema,
  CreateRoleInput,
  CreateRoleSchema,
  RemoveDirectGrantInput,
  RemoveDirectGrantSchema,
  RevokeRoleInput,
  RevokeRoleSchema,
  SetDirectGrantInput,
  SetDirectGrantSchema,
  SetRolePermissionsInput,
  SetRolePermissionsSchema,
  UpdateRoleInput,
  UpdateRoleSchema,
} from './inputs/rbac.inputs';
import {
  DirectGrantPayload,
  PermissionModel,
  RoleAssignmentPayload,
  RoleModel,
  RolePayload,
  UserAuthorizationModel,
} from './models/rbac.models';

/**
 * Role and permission administration.
 *
 * Every field here is gated twice over, and both gates are declarative: `@Permissions()`
 * decides whether the actor may reach the handler at all, and the escalation policy inside
 * the service decides whether they may do it to *this* role or *this* person. The second is
 * the one that matters — `roles:assign` says you are an administrator, not that you may
 * appoint a super-admin.
 *
 * The actor is taken from the request context rather than from an argument, which is worth
 * stating because it is what makes the policy meaningful: the rank and permissions it checks
 * against are the ones the guard resolved server-side this request, not anything the client
 * could describe about itself.
 */
@Resolver()
export class RbacResolver {
  constructor(
    private readonly roles: RoleAdminService,
    private readonly assignments: AssignmentService,
    private readonly catalogue: PermissionCatalogueService,
  ) {}

  // --- reads ----------------------------------------------------------------

  @Permissions('roles:read')
  @Query(() => [RoleModel], { name: 'roles', description: 'Every role, lowest rank first.' })
  async rolesList(): Promise<RoleRecord[]> {
    return this.roles.list();
  }

  @Permissions('roles:read')
  @Query(() => RoleModel, { name: 'role', nullable: true })
  async role(@Args('id', { type: () => String }) id: string): Promise<RoleRecord | null> {
    return this.roles.find(id);
  }

  @Permissions('permissions:read')
  @Query(() => [PermissionModel], {
    name: 'permissions',
    description:
      'The catalogue joined with the table. Unsynced keys appear with an empty id; orphaned rows with `inCatalogue: false`.',
  })
  async permissions(): Promise<PermissionModel[]> {
    return this.catalogue.list();
  }

  @Permissions('permissions:read')
  @Query(() => UserAuthorizationModel, {
    name: 'userAuthorization',
    nullable: true,
    description: 'Everything granted to one account, next to the resolved result.',
  })
  async userAuthorization(
    @Args('userId', { type: () => String }) userId: string,
  ): Promise<AuthorizationDetail | null> {
    return this.assignments.detailFor(userId);
  }

  // --- roles ----------------------------------------------------------------

  @Permissions('roles:write')
  @Mutation(() => RolePayload, { description: 'Create a custom role from catalogue permissions.' })
  async createRole(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(CreateRoleSchema)) input: CreateRoleInput,
  ): Promise<DataPayload<RoleRecord>> {
    return toPayload(
      await this.roles.create(rbacActor(actor), {
        slug: input.slug,
        name: input.name,
        description: input.description ?? '',
        rank: input.rank,
        permissions: input.permissions ?? [],
      }),
    );
  }

  @Permissions('roles:write')
  @Mutation(() => RolePayload, { description: 'Rename or re-rank a custom role.' })
  async updateRole(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(UpdateRoleSchema)) input: UpdateRoleInput,
  ): Promise<DataPayload<RoleRecord>> {
    const { roleId, ...patch } = input;
    return toPayload(await this.roles.update(rbacActor(actor), roleId, patch));
  }

  @Permissions('roles:write')
  @Mutation(() => RolePayload, {
    description:
      'Replace a role’s permission set. Drops the cached authorization of every account holding it, so the change is live on their next request.',
  })
  async setRolePermissions(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(SetRolePermissionsSchema)) input: SetRolePermissionsInput,
  ): Promise<DataPayload<RoleRecord>> {
    return toPayload(
      await this.roles.setPermissions(rbacActor(actor), input.roleId, input.permissions),
    );
  }

  @Permissions('roles:delete')
  @Mutation(() => MutationResult, { description: 'Delete a custom role that nobody holds.' })
  async deleteRole(
    @CurrentUser() actor: Actor | undefined,
    @Args('roleId', { type: () => String }) roleId: string,
  ): Promise<MutationResult> {
    return toResult(await this.roles.remove(rbacActor(actor), roleId));
  }

  // --- assignments ----------------------------------------------------------

  @Permissions('roles:assign')
  @Mutation(() => RoleAssignmentPayload, { description: 'Grant a role to an account.' })
  async assignRole(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(AssignRoleSchema)) input: AssignRoleInputType,
  ): Promise<DataPayload<RoleAssignmentRecord>> {
    return toPayload(await this.assignments.assignRole(rbacActor(actor), input));
  }

  @Permissions('roles:assign')
  @Mutation(() => MutationResult, { description: 'Revoke a role from an account.' })
  async revokeRole(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(RevokeRoleSchema)) input: RevokeRoleInput,
  ): Promise<MutationResult> {
    return toResult(await this.assignments.revokeRole(rbacActor(actor), input));
  }

  // --- direct grants --------------------------------------------------------

  @Permissions('permissions:grant')
  @Mutation(() => DirectGrantPayload, {
    description: 'Grant or deny one permission directly on an account. A denial beats every role grant.',
  })
  async setDirectGrant(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(SetDirectGrantSchema)) input: SetDirectGrantInput,
  ): Promise<DataPayload<UserPermissionRecord>> {
    return toPayload(await this.assignments.setDirectGrant(rbacActor(actor), input));
  }

  @Permissions('permissions:grant')
  @Mutation(() => MutationResult, {
    description: 'Remove a direct grant or denial, so the account’s roles decide again.',
  })
  async removeDirectGrant(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(RemoveDirectGrantSchema)) input: RemoveDirectGrantInput,
  ): Promise<MutationResult> {
    return toResult(await this.assignments.removeDirectGrant(rbacActor(actor), input));
  }

  // --- catalogue ------------------------------------------------------------

  /**
   * Reconcile the code catalogue into the table. Idempotent, and never deletes.
   *
   * `roles:write` rather than a permission of its own: it is the same authority as defining
   * what a role may do, and inventing `permissions:sync` would put a permission in the
   * catalogue whose only purpose is to guard the catalogue.
   */
  @Permissions('roles:write')
  @Mutation(() => Int, {
    description: 'Create missing permission rows and refresh descriptions. Returns rows written.',
  })
  async syncPermissionCatalogue(): Promise<number> {
    const result = await this.catalogue.sync();
    return result.ok ? result.data : 0;
  }
}

/**
 * The request's actor, narrowed to what the escalation policy needs.
 *
 * `Actor | undefined` because `@CurrentUser()` is honest about the anonymous case; every
 * field here is behind a permission so the guard has already refused that, and this throw is
 * the type system's receipt rather than a real branch.
 */
function rbacActor(actor: Actor | undefined): RbacActor {
  if (!actor) throw new UnauthenticatedError();
  return { id: actor.id, roles: actor.roles, permissions: actor.permissions };
}
