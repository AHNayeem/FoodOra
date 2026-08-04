import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { Actor } from '../../../common/context';
import { CurrentUser, FreshSession } from '../../../common/decorators';
import { UnauthenticatedError } from '../../../common/errors';
import { zodPipe } from '../../../common/pipes';
import { type DataPayload, MutationResult, toPayload, toResult, User } from '../../../graphql';
import { mapResult } from '../../../shared/kernel';
import { AccountSettingsService } from '../application/account-settings.service';
import { ProfileService } from '../application/profile.service';
import {
  CloseAccountInput,
  CloseAccountSchema,
  ProfilePatchInput,
  ProfilePatchSchema,
  SettingsPatchInput,
  SettingsPatchSchema,
} from './inputs/user.inputs';
import { toSettingsModel, toSettingsPatch, toUserModel } from './mappers';
import {
  CustomerSettingsModel,
  CustomerSettingsPayload,
  UserPayload,
} from './models/user-admin.models';

/**
 * The signed-in account acting on itself — `frontend/services/account.ts` and
 * `frontend/services/settings.ts`, seam for seam.
 *
 * No `@Permissions()` anywhere in this file, and that is the point rather than an omission:
 * every operation here is scoped to `actor.id`, so the authority is *being* the account. A
 * permission would be the wrong tool — there is no version of "may edit their own name" that
 * some customers hold and others do not.
 *
 * The security-relevant boundary is that the user id comes from the guard's resolved actor and
 * never from an argument. There is no `updateProfile(userId, …)` here to be passed somebody
 * else's id; that operation exists, it lives in `users.resolver.ts`, and it requires
 * `users:write`.
 */
@Resolver()
export class AccountResolver {
  constructor(
    private readonly profiles: ProfileService,
    private readonly settings: AccountSettingsService,
  ) {}

  // --- profile --------------------------------------------------------------

  /**
   * Note the absence of a `me` query: `AuthModule` owns it, because turning a stored access
   * token back into a user is an authentication concern and the actor's permissions are already
   * on the request context there. Two `me` fields would be a schema collision; two *sources* of
   * the signed-in account would be worse.
   */
  @Mutation(() => UserPayload, {
    description: 'Edit your own profile. frontend/services/account.ts::updateProfile.',
  })
  async updateProfile(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(ProfilePatchSchema)) input: ProfilePatchInput,
  ): Promise<DataPayload<User>> {
    if (!actor) throw new UnauthenticatedError();

    const result = await this.profiles.updateOwnProfile(actor.id, input);
    // The actor's resolved permissions are already on the context — the guard put them there —
    // so echoing the updated account costs one row rather than a re-resolution.
    return toPayload(mapResult(result, (profile) => toUserModel(profile, actor.permissions)));
  }

  // --- settings -------------------------------------------------------------

  /**
   * A plain type, not a payload. Payloads exist so a *mutation* can carry an expected refusal as
   * data (D5 §Payload types); a query has nothing to refuse — either the actor is authenticated,
   * which the guard settled, or the read succeeds.
   */
  @Query(() => CustomerSettingsModel, {
    name: 'mySettings',
    description: 'Your account settings. frontend/services/settings.ts::getSettings.',
  })
  async mySettings(@CurrentUser() actor: Actor | undefined): Promise<CustomerSettingsModel> {
    if (!actor) throw new UnauthenticatedError();
    return toSettingsModel(await this.settings.read(actor.id));
  }

  /**
   * Save a settings change, and return **the server's** merged object.
   *
   * Returning the result rather than acknowledging the input is what lets the page commit the
   * server's answer instead of trusting its own optimistic edit — and it is the only way a
   * locked channel visibly stays locked after somebody manages to submit it off.
   */
  @Mutation(() => CustomerSettingsPayload, { description: 'Update your settings. Partial writes.' })
  async updateSettings(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(SettingsPatchSchema)) input: SettingsPatchInput,
  ): Promise<DataPayload<CustomerSettingsModel>> {
    if (!actor) throw new UnauthenticatedError();

    const result = await this.settings.update(actor.id, toSettingsPatch(input));
    return toPayload(mapResult(result, toSettingsModel));
  }

  // --- closing --------------------------------------------------------------

  /**
   * Close your own account.
   *
   * `@FreshSession()` because this is irreversible from the customer's side, and a token
   * belonging to a session somebody already revoked — the "it wasn't me" case — must not be able
   * to delete the account it was signed out of.
   */
  @FreshSession()
  @Mutation(() => MutationResult, {
    description:
      'Close your account. Soft-deletes it, ends every session, and starts the retention window. frontend/services/settings.ts::deleteAccount.',
  })
  async closeAccount(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(CloseAccountSchema)) input: CloseAccountInput,
  ): Promise<MutationResult> {
    if (!actor) throw new UnauthenticatedError();
    return toResult(await this.settings.closeAccount(actor.id, input.reason ?? ''));
  }
}
