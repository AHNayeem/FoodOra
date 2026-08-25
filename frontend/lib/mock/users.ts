import type { User } from "@/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * Users — demo accounts the simulated auth service (services/auth.ts) checks
 * against. These stand in for the future accounts table; every field maps 1:1
 * onto the eventual Prisma `User` model. Passwords are intentionally trivial
 * and shown on the sign-in screen as demo hints — this is a frontend prototype
 * with no real credential store.
 *
 * Each account carries a distinct `role` so later phases (dashboards, POS,
 * rider app) can gate UI on it without inventing new data.
 */
export const users: User[] = [
  {
    id: "usr_customer",
    name: "Ayesha Rahman",
    email: "customer@foodora.dev",
    phone: "+8801711000001",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80",
    role: "customer",
    permissions: [],
    countryCode: "BD",
    currency: "BDT",
    locale: "en",
    isVerified: true,
    ...base,
  },
  {
    id: "usr_owner",
    name: "Tanvir Hossain",
    email: "owner@foodora.dev",
    phone: "+8801711000002",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80",
    role: "restaurant-owner",
    permissions: ["vendor:manage", "menu:edit", "orders:view"],
    countryCode: "BD",
    currency: "BDT",
    locale: "en",
    isVerified: true,
    ...base,
  },
  {
    id: "usr_rider",
    name: "Rakib Islam",
    email: "rider@foodora.dev",
    phone: "+8801711000003",
    avatar:
      "https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?auto=format&fit=crop&w=160&q=80",
    role: "delivery-rider",
    permissions: ["deliveries:accept", "earnings:view"],
    countryCode: "BD",
    currency: "BDT",
    locale: "en",
    isVerified: true,
    ...base,
  },
  {
    id: "usr_admin",
    name: "Nusrat Jahan",
    email: "admin@foodora.dev",
    phone: "+8801711000004",
    avatar:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=160&q=80",
    role: "super-admin",
    permissions: ["*"],
    countryCode: "BD",
    currency: "BDT",
    locale: "en",
    isVerified: true,
    ...base,
  },
  /**
   * The four other admin desks (Phase 14, G31).
   *
   * Before RBAC these accounts would have been indistinguishable from the
   * super-admin — `ADMIN_ROLES` admitted every one of them to all eleven
   * sections — so there was no reason for them to exist and they did not. They
   * exist now because they are the only way to *see* the thing Phase 14 built:
   * sign in as `moderator@foodora.dev` and platform operations has three
   * sections, not eleven, and the review queue's decision buttons are the only
   * ones that work.
   *
   * `permissions` is empty on all four on purpose. `lib/rbac.ROLE_PERMISSIONS`
   * is the grant table, and an account carries only what it holds *beyond* its
   * role; a seeded copy of the role's own set is the duplication that file
   * refuses. The super-admin's `*` above stays because it was already there and
   * `lib/rbac` reads it as what it plainly means.
   */
  {
    id: "usr_support",
    name: "Farhana Akter",
    email: "support@foodora.dev",
    phone: "+8801711000005",
    avatar:
      "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=160&q=80",
    role: "customer-support",
    permissions: [],
    countryCode: "BD",
    currency: "BDT",
    locale: "en",
    isVerified: true,
    ...base,
  },
  {
    id: "usr_moderator",
    name: "Imran Chowdhury",
    email: "moderator@foodora.dev",
    phone: "+8801711000006",
    avatar:
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=160&q=80",
    role: "moderator",
    permissions: [],
    countryCode: "BD",
    currency: "BDT",
    locale: "en",
    isVerified: true,
    ...base,
  },
  {
    id: "usr_finance",
    name: "Shirin Sultana",
    email: "finance@foodora.dev",
    phone: "+8801711000007",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80",
    role: "finance-manager",
    permissions: [],
    countryCode: "BD",
    currency: "BDT",
    locale: "en",
    isVerified: true,
    ...base,
  },
  {
    id: "usr_marketing",
    name: "Nayeem Hasan",
    email: "marketing@foodora.dev",
    phone: "+8801711000008",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80",
    role: "marketing-manager",
    permissions: [],
    countryCode: "BD",
    currency: "BDT",
    locale: "en",
    isVerified: true,
    ...base,
  },
];

/** Shared demo password for every seeded account (shown on the sign-in screen). */
export const DEMO_PASSWORD = "demo1234";

/** Fixed OTP the simulated verifier accepts, surfaced as a hint in the UI. */
export const DEMO_OTP = "123456";

export const userById = new Map(users.map((u) => [u.id, u]));
export const userByEmail = new Map(
  users.map((u) => [u.email.toLowerCase(), u]),
);
