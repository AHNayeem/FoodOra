import type { UserRole } from '../../../shared/enums';
import type { PermissionSlug } from '../../../shared/permissions';

/**
 * The fourteen built-in roles, with the rank that orders them and the permissions each
 * one carries by default.
 *
 * These are `Role` rows with `isSystem: true` — they cannot be renamed or deleted,
 * because `User.primaryRole` is a Postgres enum that names them and `@Roles()` gates
 * against those names. What *can* change is their permission set: an operator deciding
 * that customer-support may also cancel orders is a business decision, so the grants
 * below are a starting point the reference-data script writes once, not a constraint the
 * code re-asserts on every boot.
 *
 * **Rank** is what makes role administration safe. A moderator must not be able to grant
 * themselves `super-admin`, and "cannot edit a role at or above your own rank" is the one
 * rule that prevents it without enumerating every pair. The numbers are spaced by ten so
 * a role can be inserted between two without renumbering.
 */
export interface BuiltinRole {
  slug: UserRole;
  name: string;
  description: string;
  rank: number;
  permissions: readonly PermissionSlug[];
}

/** Everything a vendor operator needs to run their own shop. */
const VENDOR_PERMISSIONS: readonly PermissionSlug[] = ['vendor:manage', 'menu:edit', 'orders:view'];

export const BUILTIN_ROLES: readonly BuiltinRole[] = [
  {
    slug: 'guest',
    name: 'Guest',
    description: 'Not signed in. Holds no permissions; exists so an anonymous actor has a name.',
    rank: 0,
    permissions: [],
  },
  {
    slug: 'customer',
    name: 'Customer',
    description: 'Orders food. Everything a customer may do is scoped to their own rows.',
    rank: 10,
    permissions: [],
  },
  {
    slug: 'delivery-rider',
    name: 'Delivery Rider',
    description: 'Accepts and completes delivery jobs.',
    rank: 20,
    permissions: ['deliveries:accept', 'earnings:view'],
  },
  {
    slug: 'vendor-manager',
    name: 'Vendor Manager',
    description: 'Runs a branch day to day, without owning the vendor.',
    rank: 30,
    permissions: ['menu:edit', 'orders:view'],
  },
  {
    slug: 'restaurant-owner',
    name: 'Restaurant Owner',
    description: 'Owns one or more restaurants.',
    rank: 40,
    permissions: VENDOR_PERMISSIONS,
  },
  {
    slug: 'cafe-owner',
    name: 'Café Owner',
    description: 'Owns a café.',
    rank: 40,
    permissions: VENDOR_PERMISSIONS,
  },
  {
    slug: 'home-chef',
    name: 'Home Chef',
    description: 'Cooks from a home kitchen.',
    rank: 40,
    permissions: VENDOR_PERMISSIONS,
  },
  {
    slug: 'cloud-kitchen',
    name: 'Cloud Kitchen',
    description: 'Delivery-only kitchen, often several brands from one site.',
    rank: 40,
    permissions: VENDOR_PERMISSIONS,
  },
  {
    slug: 'catering-company',
    name: 'Catering Company',
    description: 'Quotes and fulfils catering orders.',
    rank: 40,
    permissions: VENDOR_PERMISSIONS,
  },
  {
    slug: 'customer-support',
    name: 'Customer Support',
    description: 'Answers customers. Reads accounts; changes very little.',
    rank: 50,
    permissions: ['users:read', 'orders:view'],
  },
  {
    slug: 'moderator',
    name: 'Moderator',
    description: 'Reviews user-generated content and can suspend an account.',
    rank: 60,
    permissions: ['users:read', 'users:status'],
  },
  {
    slug: 'marketing-manager',
    name: 'Marketing Manager',
    description: 'Runs campaigns, offers and content.',
    rank: 70,
    permissions: ['users:read', 'settings:read'],
  },
  {
    slug: 'finance-manager',
    name: 'Finance Manager',
    description: 'Owns payouts, refunds and reconciliation.',
    rank: 70,
    permissions: ['users:read', 'settings:read'],
  },
  {
    slug: 'super-admin',
    name: 'Super Admin',
    /**
     * The permission list is empty on purpose. `resolveAuthorization` short-circuits this
     * role to the `*` wildcard, so enumerating grants here would be a second, immediately
     * stale answer to a question already answered — and the day a new permission is added,
     * the list version would be the one that is wrong.
     */
    description: 'Holds everything, resolved as the "*" wildcard rather than as a grant list.',
    rank: 100,
    permissions: [],
  },
];

const BY_SLUG = new Map<string, BuiltinRole>(BUILTIN_ROLES.map((role) => [role.slug, role]));

export function builtinRole(slug: string): BuiltinRole | undefined {
  return BY_SLUG.get(slug);
}

/** The rank of a role slug; 0 for anything unrecognised, which is the safe direction. */
export function rankOf(slug: string): number {
  return BY_SLUG.get(slug)?.rank ?? 0;
}
