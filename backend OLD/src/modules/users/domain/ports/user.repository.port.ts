import type { UserRole, UserStatus } from '../../../../shared/enums';
import type {
  AdminProfilePatch,
  UserFilter,
  UserPage,
  UserProfile,
  UserSortKey,
} from '../models';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
  /** `null` for an unknown or closed account, unless `includeDeleted`. */
  findById(userId: string, includeDeleted?: boolean): Promise<UserProfile | null>;

  /**
   * The directory. Filters compile to one `where` in the repository — the allowlist is the
   * builder, so a field absent from it is unreachable whatever the client sends
   * (D5 §Filtering & sorting).
   */
  list(
    filter: UserFilter,
    sort: UserSortKey,
    window: { skip: number; take: number; page: number; pageSize: number },
  ): Promise<UserPage>;

  updateProfile(userId: string, patch: AdminProfilePatch): Promise<UserProfile>;

  /** True when another *live or closed* account already holds this phone. */
  phoneTaken(phone: string, exceptUserId: string): Promise<boolean>;

  setStatus(userId: string, status: UserStatus): Promise<UserProfile>;

  /**
   * `User.primaryRole` and the mirroring `UserRoleAssignment` row, in one call.
   *
   * They are one operation because they are one fact: `resolveAuthorization` treats the
   * column as authoritative for the *role* and the assignment as the source of the role's
   * *permissions*, so writing one without the other gives an account a role that carries
   * nothing. The caller wraps this in a transaction.
   */
  setPrimaryRole(userId: string, role: UserRole): Promise<UserProfile>;

  /** Soft delete. Returns false when the account was already closed. */
  close(userId: string): Promise<boolean>;
  /** Undo a close. Returns false when the account was not closed. */
  reopen(userId: string): Promise<boolean>;
}
