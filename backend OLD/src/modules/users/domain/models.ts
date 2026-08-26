import type {
  NotificationChannel,
  NotificationTopic,
  UserRole,
  UserStatus,
} from '../../../shared/enums';

/**
 * The account, as this module reads and writes it.
 *
 * Wider than `auth`'s `AuthUser`, and the overlap is deliberate rather than accidental
 * duplication: `AuthUser` is what a sign-in needs, this is what a profile screen and a user
 * directory need, and the two evolve for different reasons. Sharing one record would mean
 * every field the admin table wants is also fetched on the authentication hot path.
 */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string;
  primaryRole: UserRole;
  status: UserStatus;
  countryCode: string;
  currency: string;
  locale: string;
  timezone: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  isVerified: boolean;
  lastLoginAt: Date | null;
  marketingOptIn: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * What a customer may change about themselves — exactly
 * `frontend/services/account.ts::ProfilePatch` plus the two consent flags the settings page
 * already drives.
 *
 * Note what is absent: `email`, `role`, `status`, `countryCode`. An email change is a
 * verification flow rather than a field edit (it moves the identity a password reset would
 * be sent to), and the other three are somebody else's decision about you. `undefined`
 * means "leave alone" throughout; `null` clears a nullable field.
 */
export interface ProfilePatch {
  name?: string;
  phone?: string | null;
  avatar?: string;
  locale?: string;
  currency?: string;
  timezone?: string | null;
  marketingOptIn?: boolean;
}

/** What an administrator may change about somebody else. */
export interface AdminProfilePatch extends ProfilePatch {
  countryCode?: string;
}

/** `frontend/types/settings.ts::CustomerSettings`, field for field. */
export interface CustomerSettings {
  notifications: Record<NotificationTopic, Record<NotificationChannel, boolean>>;
  privacy: {
    personalizedRecommendations: boolean;
    shareOrderActivity: boolean;
    saveSearchHistory: boolean;
  };
  security: {
    loginAlerts: boolean;
    twoFactor: boolean;
  };
}

/** A settings write. Every branch optional, so a page can save one toggle. */
export interface SettingsPatch {
  notifications?: Partial<Record<NotificationTopic, Partial<Record<NotificationChannel, boolean>>>>;
  privacy?: Partial<CustomerSettings['privacy']>;
  security?: Partial<CustomerSettings['security']>;
}

/** The directory's filter. Every field narrows; none of them is required. */
export interface UserFilter {
  /** Matched against name, email and phone. */
  q?: string | null;
  role?: UserRole | null;
  status?: UserStatus | null;
  countryCode?: string | null;
  isVerified?: boolean | null;
  /** Include closed accounts. Off by default — a tombstone is not a user. */
  includeDeleted?: boolean | null;
}

export type UserSortKey = 'newest' | 'oldest' | 'name' | 'lastLogin';

export interface UserPage {
  items: UserProfile[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
