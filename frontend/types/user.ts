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
