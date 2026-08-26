/**
 * `frontend/types/user.ts::UserRole`, verbatim.
 *
 * Kebab-case, and that is the whole reason it is a scalar rather than a GraphQL
 * enum — `"restaurant-owner"` cannot be a GraphQL enum value, and mapping
 * `RESTAURANT_OWNER ↔ "restaurant-owner"` on the client would put a translation
 * layer in the one place this architecture exists to avoid (D5 §Enums).
 *
 * Postgres stores the same strings via `@map` on `UserRoleSlug`, so a row, a
 * token claim and a React prop all read identically.
 */
export const USER_ROLES = [
  'guest',
  'customer',
  'restaurant-owner',
  'cafe-owner',
  'home-chef',
  'cloud-kitchen',
  'catering-company',
  'delivery-rider',
  'vendor-manager',
  'customer-support',
  'moderator',
  'finance-manager',
  'marketing-manager',
  'super-admin',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/**
 * The roles a stranger may give themselves at the registration form — exactly
 * the two `frontend/services/auth.ts::RegisterInput` offers.
 *
 * Everything else is granted by someone who already holds authority: a rider is
 * onboarded, a moderator is appointed. Reading the role straight off the request
 * body without this gate is how a signup form becomes a privilege-escalation
 * endpoint.
 */
export const SELF_SERVICE_ROLES = ['customer', 'restaurant-owner'] as const;

export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

export function isSelfServiceRole(value: string): value is SelfServiceRole {
  return (SELF_SERVICE_ROLES as readonly string[]).includes(value);
}

/**
 * Holding this role means holding every permission. It is checked in the pure
 * resolution function, not in a guard, so there is one answer to "may they?"
 * rather than one per call site — see `modules/rbac/domain/permission-set.ts`.
 */
export const SUPER_ADMIN_ROLE = 'super-admin' satisfies UserRole;
