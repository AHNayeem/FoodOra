import { Inject, Injectable } from '@nestjs/common';

import { fail, ok, type Result } from '../../../shared/kernel';
import { REGION_CATALOG, type RegionCatalogPort } from '../../regions/domain';
import {
  type AdminProfilePatch,
  type ProfilePatch,
  USER_REPOSITORY,
  UserError,
  type UserProfile,
  type UserRepositoryPort,
} from '../domain';

/**
 * The signed-in account's own profile — `frontend/services/account.ts::updateProfile`.
 *
 * Small, and the interesting part is what it refuses. Three fields on a profile are
 * references into reference data (`locale`, `currency`, `countryCode`) and one is a unique
 * identity (`phone`), so a profile edit is mostly a validation problem:
 *
 * - **A locale or currency the platform does not offer** would render as a broken price or an
 *   untranslated page, and the failure would surface far from the edit that caused it. The
 *   database cannot refuse it — neither column is an FK — so this is the only place it can be
 *   caught.
 * - **A phone already on another account** must fail on the *field*, with
 *   `errors.phoneTaken`, rather than as a unique-constraint violation translated into a
 *   generic "already exists". Same reasoning as E2's `emailTaken`: the check sees closed
 *   accounts too, because the unique index does.
 *
 * What this service deliberately cannot change: email, role, status. An email change moves
 * the address a password reset is sent to, which makes it a verification flow rather than a
 * field edit; the other two are somebody else's decision about you and live in
 * `UserDirectoryService`.
 */
@Injectable()
export class ProfileService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(REGION_CATALOG) private readonly regions: RegionCatalogPort,
  ) {}

  async profile(userId: string): Promise<UserProfile | null> {
    return this.users.findById(userId);
  }

  /** The customer editing themselves. */
  async updateOwnProfile(userId: string, patch: ProfilePatch): Promise<Result<UserProfile>> {
    return this.update(userId, patch);
  }

  /** An administrator editing somebody else. Authority is checked by the caller. */
  async updateProfileAsAdmin(
    userId: string,
    patch: AdminProfilePatch,
  ): Promise<Result<UserProfile>> {
    return this.update(userId, patch);
  }

  private async update(userId: string, patch: AdminProfilePatch): Promise<Result<UserProfile>> {
    const existing = await this.users.findById(userId);
    if (!existing) return fail(UserError.notFound);

    const checked = await this.checkReferences(patch);
    if (!checked.ok) return checked;

    if (patch.phone !== undefined && patch.phone !== null && patch.phone !== existing.phone) {
      if (await this.users.phoneTaken(patch.phone, userId)) {
        return fail(UserError.phoneTaken, { path: 'input.phone' });
      }
    }

    /**
     * Changing the phone un-verifies it, which the repository handles — but it is worth being
     * explicit about why: `isVerified` and `phoneVerifiedAt` describe a *channel*, and a new
     * number has not been proved. Carrying the old verification across would let an account
     * hold a "verified" phone nobody ever confirmed, which is the whole value of the flag.
     */
    const updated = await this.users.updateProfile(userId, patch);
    return ok(updated);
  }

  /**
   * Locale, currency and country against the live catalogue.
   *
   * Each is checked only when the patch mentions it, so an account whose country was later
   * deactivated can still edit their name — refusing that would trap people in a market the
   * operator closed.
   */
  private async checkReferences(patch: AdminProfilePatch): Promise<Result<null>> {
    if (patch.locale !== undefined && !(await this.regions.activeLanguage(patch.locale))) {
      return fail(UserError.unknownLocale, { path: 'input.locale', params: { code: patch.locale } });
    }

    if (patch.currency !== undefined && !(await this.regions.activeCurrency(patch.currency))) {
      return fail(UserError.unknownCurrency, {
        path: 'input.currency',
        params: { code: patch.currency },
      });
    }

    if (patch.countryCode !== undefined) {
      const country = await this.regions.activeCountry(patch.countryCode);
      if (!country) {
        return fail(UserError.unknownCountry, {
          path: 'input.countryCode',
          params: { code: patch.countryCode },
        });
      }
    }

    return ok(null);
  }
}
