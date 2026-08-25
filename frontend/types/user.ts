import type { BaseEntity } from "./common";

/**
 * user.ts — accounts and the RBAC role model.
 *
 * The spec enumerates many user types plus a custom role/permission system.
 * Roles are modeled as string unions now and become a DB-backed table later;
 * `permissions` is already free-form so custom roles need no type change.
 */

export type UserRole =
  | "guest"
  | "customer"
  | "restaurant-owner"
  | "cafe-owner"
  | "home-chef"
  | "cloud-kitchen"
  | "catering-company"
  | "delivery-rider"
  | "vendor-manager"
  | "customer-support"
  | "moderator"
  | "finance-manager"
  | "marketing-manager"
  | "super-admin";

export interface User extends BaseEntity {
  name: string;
  email: string;
  phone: string | null;
  avatar: string;
  role: UserRole;
  /** Fine-grained permission slugs; empty for roles that rely purely on role. */
  permissions: string[];
  countryCode: string;
  currency: string;
  locale: string;
  isVerified: boolean;
}

/**
 * What a platform account may do.
 *
 * Slugs in `resource.action` form, which is what makes `can(user, resource,
 * action)` a composition rather than a second vocabulary — the two entry points
 * in `lib/rbac` are the same table read two ways.
 *
 * Sixteen of these are the ones §6's Phase 14 names. Four more —
 * `support.view`, `support.manage`, `content.manage`, `notifications.send` —
 * cover admin surfaces that already existed and would otherwise have been the
 * only ungated pages in the section: Phase 5's dispute queue, C26's content desk
 * and C25's broadcast composer. Named the same way, and listed apart here so the
 * distinction between "the spec asked for this" and "this surface exists and
 * needed a name" stays legible.
 *
 * These are the same free-form strings `User.permissions` was always typed to
 * hold, so no account shape changed to introduce them. Restaurant-scoped rights
 * are a different vocabulary and stay in `types/staff.StaffPermission` — see the
 * header of `lib/rbac`.
 */
export type PlatformPermission =
  // Orders and the money that comes back out of them.
  | "orders.view"
  | "orders.manage"
  | "refunds.manage"
  // Partners.
  | "restaurants.view"
  | "restaurants.approve"
  | "riders.view"
  | "riders.approve"
  // People who order.
  | "customers.view"
  | "customers.manage"
  // Payouts.
  | "payouts.view"
  | "payouts.manage"
  // Promotion and moderation.
  | "coupons.manage"
  | "reviews.moderate"
  // Reading the platform, and changing how it runs.
  | "analytics.view"
  | "settings.manage"
  | "audit.view"
  // The four beyond §6's list (see above).
  | "support.view"
  | "support.manage"
  | "content.manage"
  | "notifications.send";

/**
 * Split a slug. Written with a naked type parameter on the left of `extends`
 * because that is what makes the conditional *distribute* over the union — the
 * same expression written against `PlatformPermission` directly collapses to
 * `never`, which would silently widen every `can()` argument to nothing.
 */
type ResourceOf<P extends string> = P extends `${infer R}.${string}` ? R : never;
type ActionOf<P extends string, R extends string> = P extends `${R}.${infer A}`
  ? A
  : never;

/** The left-hand side of every permission slug — `can()`'s `resource`. */
export type PermissionResource = ResourceOf<PlatformPermission>;

/**
 * The verbs a given resource actually has.
 *
 * Derived from the slug union rather than declared, so `can(user, "orders",
 * "approve")` is a type error instead of a call that quietly returns false —
 * a misspelt permission check is the failure mode an RBAC layer must not have.
 */
export type PermissionAction<R extends PermissionResource> = ActionOf<
  PlatformPermission,
  R
>;
