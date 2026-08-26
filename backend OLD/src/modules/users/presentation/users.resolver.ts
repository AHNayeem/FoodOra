import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { Actor } from '../../../common/context';
import { CurrentUser, Permissions } from '../../../common/decorators';
import { UnauthenticatedError } from '../../../common/errors';
import { PageInput, toSkipTake } from '../../../common/pagination';
import { zodPipe } from '../../../common/pipes';
import { type DataPayload, MutationResult, toPayload, toResult, User, UserSort } from '../../../graphql';
import { mapResult, ok, type Result } from '../../../shared/kernel';
import { PERMISSION_RESOLUTION, type PermissionResolutionPort } from '../../rbac/domain';
import { Inject } from '@nestjs/common';
import { ProfileService } from '../application/profile.service';
import {
  type DirectoryActor,
  UserDirectoryService,
} from '../application/user-directory.service';
import type { UserProfile, UserSortKey } from '../domain';
import {
  AdminProfilePatchInput,
  AdminProfilePatchSchema,
  SetPrimaryRoleInput,
  SetPrimaryRoleSchema,
  SetUserStatusInput,
  SetUserStatusSchema,
  UserFilterInput,
  UserFilterSchema,
} from './inputs/user.inputs';
import { toAdminView, toUserModel } from './mappers';
import {
  UserAdminPayload,
  UserAdminView,
  UserPage,
  UserPayload,
} from './models/user-admin.models';

/** GraphQL's `UserSort` enum → the domain's sort key. One place, so the mapping cannot drift. */
const SORT_KEYS: Record<UserSort, UserSortKey> = {
  [UserSort.NEWEST]: 'newest',
  [UserSort.OLDEST]: 'oldest',
  [UserSort.NAME]: 'name',
  [UserSort.LAST_LOGIN]: 'lastLogin',
};

/**
 * The administrative view of accounts.
 *
 * Everything here is gated twice: `@Permissions()` decides whether the caller is an
 * administrator at all, and the rank rule inside `UserDirectoryService` decides whether they may
 * do it to *this* account. The second gate is the one that stops a moderator from suspending a
 * finance manager, and it cannot be expressed as a permission because it depends on the target.
 *
 * The permission split is deliberately finer than "admin": reading the directory
 * (`users:read`) is what support does all day, changing a status (`users:status`) is a
 * moderator's power, and closing an account (`users:delete`) is neither. Bundling them would
 * mean every support agent could delete accounts.
 */
@Resolver()
export class UsersResolver {
  constructor(
    private readonly directory: UserDirectoryService,
    private readonly profiles: ProfileService,
    @Inject(PERMISSION_RESOLUTION) private readonly permissions: PermissionResolutionPort,
  ) {}

  // --- reads ----------------------------------------------------------------

  /**
   * The directory.
   *
   * `permissions` on each row comes back **empty**, and that is a deliberate choice rather than an
   * oversight: resolving the permission set for twelve accounts is twelve cache reads or twelve
   * queries, to render a column nobody reads in a table. `userAuthorization(userId)` in the RBAC
   * module answers it properly for one account, which is where the question is actually asked.
   */
  @Permissions('users:read')
  @Query(() => UserPage, {
    name: 'users',
    description:
      'The user directory. `permissions` is empty on each row — use `userAuthorization(userId)` for one account.',
  })
  async users(
    @Args('filter', { type: () => UserFilterInput, nullable: true }, zodPipe(UserFilterSchema.optional()))
    filter: UserFilterInput | undefined,
    @Args('sort', { type: () => UserSort, defaultValue: UserSort.NEWEST }) sort: UserSort,
    @Args('page', { type: () => PageInput, nullable: true }) page: PageInput | undefined,
  ): Promise<{ items: User[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
    const window = toSkipTake(page);
    const result = await this.directory.list(filter ?? {}, SORT_KEYS[sort], window);

    return {
      ...result,
      items: result.items.map((profile) => toUserModel(profile, [])),
    };
  }

  /** One account, with the operational fields and its resolved permissions. */
  @Permissions('users:read')
  @Query(() => UserAdminView, {
    name: 'user',
    nullable: true,
    description: 'One account. `includeDeleted` lets support look at a closed one.',
  })
  async user(
    @Args('userId', { type: () => String }) userId: string,
    @Args('includeDeleted', { type: () => Boolean, defaultValue: false }) includeDeleted: boolean,
  ): Promise<UserAdminView | null> {
    const profile = await this.directory.find(userId, includeDeleted);
    if (!profile) return null;
    return toAdminView(profile, await this.resolvedPermissions(userId));
  }

  // --- writes ---------------------------------------------------------------

  @Permissions('users:write')
  @Mutation(() => UserPayload, { description: 'Edit another account’s profile.' })
  async updateUserProfile(
    @Args('input', zodPipe(AdminProfilePatchSchema)) input: AdminProfilePatchInput,
  ): Promise<DataPayload<User>> {
    const { userId, ...patch } = input;
    const result = await this.profiles.updateProfileAsAdmin(userId, patch);
    return toPayload(mapResult(result, (profile) => toUserModel(profile, [])));
  }

  @Permissions('users:status')
  @Mutation(() => UserAdminPayload, {
    description:
      'Suspend, ban or reinstate an account. Suspending or banning ends every session immediately rather than at token expiry.',
  })
  async setUserStatus(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(SetUserStatusSchema)) input: SetUserStatusInput,
  ): Promise<DataPayload<UserAdminView>> {
    const result = await this.directory.setStatus(
      directoryActor(actor),
      input.userId,
      input.status,
    );
    return toPayload(await this.mapAdminView(result));
  }

  @Permissions('roles:assign')
  @Mutation(() => UserAdminPayload, {
    description:
      'Change an account’s primary role. Does not sign them out — E2 resolves authorization per request, so the new role applies on their next call.',
  })
  async setUserPrimaryRole(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(SetPrimaryRoleSchema)) input: SetPrimaryRoleInput,
  ): Promise<DataPayload<UserAdminView>> {
    const result = await this.directory.setPrimaryRole(
      directoryActor(actor),
      input.userId,
      input.role,
    );
    return toPayload(await this.mapAdminView(result));
  }

  @Permissions('users:delete')
  @Mutation(() => MutationResult, {
    description: 'Close another account. Soft-deletes it and ends every session.',
  })
  async closeUserAccount(
    @CurrentUser() actor: Actor | undefined,
    @Args('userId', { type: () => String }) userId: string,
  ): Promise<MutationResult> {
    return toResult(await this.directory.closeAccount(directoryActor(actor), userId));
  }

  @Permissions('users:delete')
  @Mutation(() => UserAdminPayload, { description: 'Reopen a closed account.' })
  async reopenUserAccount(
    @CurrentUser() actor: Actor | undefined,
    @Args('userId', { type: () => String }) userId: string,
  ): Promise<DataPayload<UserAdminView>> {
    const result = await this.directory.reopenAccount(directoryActor(actor), userId);
    return toPayload(await this.mapAdminView(result));
  }

  // --- internals ------------------------------------------------------------

  /**
   * Resolve the permission set for one account, tolerating failure.
   *
   * An account whose authorization cannot be resolved still has a profile worth showing — the
   * alternative is an admin screen that goes blank when Redis is slow, for a column that is
   * informational.
   */
  private async resolvedPermissions(userId: string): Promise<readonly string[]> {
    const resolved = await this.permissions.resolve(userId);
    return resolved?.permissions ?? [];
  }

  /**
   * A successful admin mutation echoes the account *with* its freshly resolved permissions —
   * which is the whole point of returning something rather than an acknowledgement. A status
   * change or a role change alters that set, and the caller has just invalidated the cache, so
   * this resolve is what proves the change landed.
   */
  private async mapAdminView(result: Result<UserProfile>): Promise<Result<UserAdminView>> {
    if (!result.ok) return result;
    return ok(toAdminView(result.data, await this.resolvedPermissions(result.data.id)));
  }
}

/**
 * The request's actor, narrowed to what the rank rule needs.
 *
 * Taken from the guard's resolved actor, never from an argument — which is what makes the rank
 * check meaningful. The `undefined` branch is unreachable behind `@Permissions()`; the throw is
 * the type system's receipt.
 */
function directoryActor(actor: Actor | undefined): DirectoryActor {
  if (!actor) throw new UnauthenticatedError();
  return { id: actor.id, roles: actor.roles, permissions: actor.permissions };
}
