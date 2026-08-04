import { Inject, Injectable, Logger } from '@nestjs/common';

import { SESSION_CONTROL, type SessionControlPort } from '../../../shared/contracts';
import type { SessionRevokeReason } from '../../../shared/enums';
import { fail, ok, type Result } from '../../../shared/kernel';
import { PERMISSION_RESOLUTION, type PermissionResolutionPort } from '../../rbac/domain';
import {
  attemptedRequiredOptOut,
  type CustomerSettings,
  mergeSettings,
  type SettingsPatch,
  USER_REPOSITORY,
  USER_SETTINGS_REPOSITORY,
  UserError,
  type UserRepositoryPort,
  type UserSettingsRepositoryPort,
} from '../domain';

/**
 * The customer's own settings, and closing their own account.
 *
 * These are `frontend/services/settings.ts` — `getSettings`, `updateSettings`,
 * `deleteAccount` — with the same signatures and the same i18n keys.
 *
 * The one thing worth reading closely is `closeAccount`, because "delete my account" is three
 * facts that have to happen together and the order matters.
 */
@Injectable()
export class AccountSettingsService {
  private readonly logger = new Logger(AccountSettingsService.name);

  constructor(
    @Inject(USER_SETTINGS_REPOSITORY) private readonly settings: UserSettingsRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(SESSION_CONTROL) private readonly sessions: SessionControlPort,
    @Inject(PERMISSION_RESOLUTION) private readonly permissions: PermissionResolutionPort,
  ) {}

  async read(userId: string): Promise<CustomerSettings> {
    return this.settings.read(userId);
  }

  /**
   * Merge a partial write into the stored object, force on what cannot be switched off, and
   * return **the server's** version.
   *
   * Returning the merged result rather than acknowledging the input is what lets the page
   * commit the server's answer instead of assuming its optimistic edit stuck — which is
   * exactly what the prototype's `updateSettings` already simulates, and the only way a
   * locked channel visibly stays locked.
   */
  async update(userId: string, patch: SettingsPatch): Promise<Result<CustomerSettings>> {
    const current = await this.settings.read(userId);

    const refused = attemptedRequiredOptOut(patch);
    if (refused.length > 0) {
      // Corrected rather than refused (see `enforceRequiredChannels`), but logged: a client
      // repeatedly trying to disable order receipts is either a bug worth finding or a UI
      // lying to somebody about what they just turned off.
      this.logger.warn(
        `${userId} attempted to opt out of required channels: ${refused
          .map(([topic, channel]) => `${topic}.${channel}`)
          .join(', ')}`,
      );
    }

    const merged = mergeSettings(current, patch);
    return ok(await this.settings.write(userId, merged));
  }

  /**
   * Close the account.
   *
   * Three facts, in this order, and the order is the design:
   *
   * 1. **Soft delete the row.** `deletedAt` is what makes the account invisible to every
   *    read — the extension filters it globally — so this is what actually closes it. It
   *    comes first because it is the fact the other two are cleaning up after.
   * 2. **End every session.** Via `SESSION_CONTROL`, which bumps the token epoch as well as
   *    revoking the rows, so the stateless access token that authorised this very call stops
   *    working immediately rather than at its next expiry.
   * 3. **Drop the cached authorization.** Otherwise the guard could still resolve a
   *    permission set for a closed account from Redis for up to five minutes.
   *
   * Not transactional, and deliberately: step 1 is Postgres, steps 2 and 3 are Postgres *and*
   * Redis, and a transaction cannot span them. So the order is chosen so that every partial
   * failure leaves the account **more** closed rather than less — if step 2 fails, the account
   * is already invisible and unable to authenticate, and the retry is idempotent.
   *
   * What is **not** done here: erasure. The row is retained for
   * `accounts.retentionDaysAfterClose`, because an order history is a financial record and a
   * closed account is often a reopened one. Actual purging is a scheduled job, and the reason
   * for the retention window is a legal commitment rather than a preference — which is why
   * that setting is operator-only.
   */
  async closeAccount(userId: string, reason: string): Promise<Result<null>> {
    const account = await this.users.findById(userId);
    if (!account) return fail(UserError.notFound);

    const closed = await this.users.close(userId);
    if (!closed) return fail(UserError.alreadyClosed);

    // `logout`, not `admin`: the person did this to themselves, and the revoke reason is what
    // a support agent reads when asked "why was I signed out?".
    await this.endAccess(userId, 'logout');

    // The reason is not a column: `User` has no field for it, and inventing one for free text
    // nobody reads would be worse than a log line that support can find.
    this.logger.log(`Account ${userId} closed. Stated reason: ${reason || '(none given)'}`);
    return ok(null);
  }

  /** Steps 2 and 3, shared with the administrative paths that also need to cut access. */
  private async endAccess(userId: string, reason: SessionRevokeReason): Promise<void> {
    await this.sessions.revokeAllSessions(userId, reason);
    await this.permissions.invalidate(userId);
  }
}
