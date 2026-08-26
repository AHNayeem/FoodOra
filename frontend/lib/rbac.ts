import type {
  PermissionAction,
  PermissionResource,
  PlatformPermission,
  User,
  UserRole,
} from "@/types";

/**
 * rbac.ts — who may do what on the platform (Phase 14, G31).
 *
 * `User.permissions` has existed since the first commit and nothing has ever read
 * it. The audit filed that as G31 and the consequence was visible on every admin
 * screen: `components/admin/admin-shell` admitted four roles to *all eleven*
 * sections, so a moderator could run a payout and a finance manager could remove
 * a review. This file is the single table that decides those questions, and the
 * two functions §6 asks for — `hasPermission` and `can` — are two readings of it.
 *
 * Pure, like every other `lib/` module: no clock, no storage, no store import, no
 * `next-intl`. `stores/auth` is what holds the session and exposes the React-side
 * wrappers; every surface asks through those rather than deciding anything itself.
 *
 * Four decisions worth stating, because each is the kind a plausible-looking
 * implementation gets wrong:
 *
 *  - **The role table is the truth; an account's `permissions` only adds to it.**
 *    `ROLE_PERMISSIONS` answers "what may a finance manager do", once, for every
 *    finance manager. An account carries only what it holds *beyond* its role, so
 *    changing the table reaches everybody — the same argument
 *    `lib/staff.STAFF_PERMISSIONS` makes for restaurant roles, and the reason a
 *    stored copy per account is refused in both places.
 *  - **`*` is honoured, because the seed already uses it.** `usr_admin` was seeded
 *    with `permissions: ["*"]` long before anything read the field. Treating that
 *    as a literal permission slug would have locked the platform's own super-admin
 *    out of every screen, so the wildcard means what it looks like it means, and
 *    `orders.*` works for the same reason at the resource level.
 *  - **Legacy colon slugs are a different vocabulary and are ignored.** The seeded
 *    accounts hold `vendor:manage`, `menu:edit`, `orders:view`, `deliveries:accept`
 *    and `earnings:view` from a phase that invented a punctuation and never read
 *    it back. It is tempting to read `orders:view` as `orders.view` — the strings
 *    are one character apart. It would also be wrong, and dangerously so: that
 *    slug sits on `restaurant-owner`, where it plainly means "see the orders at my
 *    restaurant", and reading it as the platform right would hand every restaurant
 *    owner on the platform the admin order list and every other restaurant's
 *    trade. §5.3 forbids exactly that leak in its other guise. So a colon slug
 *    grants nothing here, and the surface it was written for — the merchant
 *    dashboard — is unaffected because nothing there ever read it either.
 *  - **Restaurant rights are a different vocabulary and stay one.**
 *    `types/staff.StaffPermission` answers "what may this person do at this
 *    restaurant" and `PlatformPermission` answers "what may this account do to the
 *    platform". Folding them would mean `settings.manage` had two meanings —
 *    a vendor's opening hours and the platform's configuration — which is exactly
 *    the collision `types/staff` was written to avoid. `lib/staff.staffCan` is
 *    untouched by this file and still governs the merchant dashboard.
 */

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

/**
 * Every permission, in the order the audit log's filter and the role reference
 * read them. Grouped by resource, not alphabetically: the grouping is how a
 * person actually scans "what can this account touch".
 */
export const PLATFORM_PERMISSIONS: readonly PlatformPermission[] = [
  "orders.view",
  "orders.manage",
  "refunds.manage",
  "restaurants.view",
  "restaurants.approve",
  "riders.view",
  "riders.approve",
  "customers.view",
  "customers.manage",
  "support.view",
  "support.manage",
  "payouts.view",
  "payouts.manage",
  "coupons.manage",
  "reviews.moderate",
  "content.manage",
  "notifications.send",
  "analytics.view",
  "audit.view",
  "settings.manage",
];

/** The slug that grants everything. Seeded on `usr_admin` — see the header. */
export const WILDCARD = "*";

const PERMISSION_SET = new Set<string>(PLATFORM_PERMISSIONS);

// ---------------------------------------------------------------------------
// Roles and what they grant
// ---------------------------------------------------------------------------

/**
 * What each role grants.
 *
 * The shape of this table *is* the argument for the roles existing at all — each
 * one is a desk somebody actually staffs, and each has a materially different
 * set. Read the empty rows as deliberate: a customer, a rider and a restaurant
 * owner hold no platform rights at all, because everything they can do they do to
 * their own records through their own surfaces. Granting `orders.view` to a
 * restaurant owner would be granting them *every* order on the platform, which is
 * the bug §5.3 exists to prevent in a different guise.
 *
 * The five vendor roles are listed separately rather than collapsed, because they
 * are distinct account kinds in `UserRole` and a future phase may well give a
 * `catering-company` something a `home-chef` does not have.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly PlatformPermission[]> = {
  guest: [],
  customer: [],
  "restaurant-owner": [],
  "cafe-owner": [],
  "home-chef": [],
  "cloud-kitchen": [],
  "catering-company": [],
  "delivery-rider": [],
  /**
   * Partner operations: the desk that onboards and looks after restaurants and
   * riders. Reads orders for context, approves paperwork, and touches no money.
   */
  "vendor-manager": [
    "orders.view",
    "restaurants.view",
    "restaurants.approve",
    "riders.view",
    "riders.approve",
    "analytics.view",
  ],
  /**
   * The support desk. Everything a phone call needs: find the order, find the
   * person, intervene, and give the money back. It may *not* approve a partner or
   * pay one — a refund is an apology and a payout is a transfer.
   */
  "customer-support": [
    "orders.view",
    "orders.manage",
    "refunds.manage",
    "customers.view",
    "customers.manage",
    "support.view",
    "support.manage",
    "restaurants.view",
    "riders.view",
  ],
  /**
   * Moderation. Reviews, and the context needed to judge one — who wrote it and
   * whether there was an order behind it. Not the customer's account: hiding a
   * review and blocking the person who wrote it are different decisions, and the
   * second belongs to support.
   */
  moderator: [
    "reviews.moderate",
    "orders.view",
    "customers.view",
    "restaurants.view",
    "support.view",
  ],
  /**
   * The money. Settlements, transfers, refunds, and the audit trail — because the
   * person who signs off a payout run is the person who has to be able to show
   * what was paid and by whom.
   */
  "finance-manager": [
    "orders.view",
    "refunds.manage",
    "payouts.view",
    "payouts.manage",
    "restaurants.view",
    "riders.view",
    "analytics.view",
    "audit.view",
  ],
  /** Promotion: campaigns, broadcasts, the content desk, and the numbers. */
  "marketing-manager": [
    "coupons.manage",
    "notifications.send",
    "content.manage",
    "customers.view",
    "orders.view",
    "analytics.view",
  ],
  /** Everything. The seed also carries `*`; either route reaches the same set. */
  "super-admin": PLATFORM_PERMISSIONS,
};

// ---------------------------------------------------------------------------
// Reading an account
// ---------------------------------------------------------------------------

/**
 * Read one stored slug, or refuse it.
 *
 * Keeps the wildcard, keeps a known permission, keeps a resource wildcard for
 * `permissionsFor` to expand — and drops everything else, the legacy colon form
 * included (see the header). Dropping rather than passing through is the point: an
 * unrecognised slug that survived into the effective set would make
 * `hasPermission` answer "yes" for a right nobody defined.
 */
function normalise(slug: string): string | null {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  if (trimmed === WILDCARD) return WILDCARD;
  if (PERMISSION_SET.has(trimmed)) return trimmed;
  // A resource wildcard — `orders.*` — expands in `permissionsFor`, not here.
  if (trimmed.endsWith(`.${WILDCARD}`) && !trimmed.includes(":")) return trimmed;
  return null;
}

/**
 * What this account may actually do.
 *
 * Role grant, plus whatever the account itself carries, expanded through the two
 * wildcards. The order is `PLATFORM_PERMISSIONS`' order rather than insertion
 * order, so the same account always renders the same list — a permission
 * reference that reshuffles between renders is a reference nobody trusts.
 *
 * A `null` user — signed out — holds nothing. There is no anonymous read on the
 * admin side, so that is the whole of the guest case.
 */
export function permissionsFor(user: User | null | undefined): PlatformPermission[] {
  if (!user) return [];

  const own = user.permissions.map(normalise).filter((p): p is string => p !== null);
  if (own.includes(WILDCARD)) return [...PLATFORM_PERMISSIONS];

  const granted = new Set<string>(ROLE_PERMISSIONS[user.role] ?? []);
  for (const slug of own) {
    if (PERMISSION_SET.has(slug)) {
      granted.add(slug);
      continue;
    }
    // `orders.*` — every action this resource has.
    const resource = slug.slice(0, -`.${WILDCARD}`.length);
    for (const permission of PLATFORM_PERMISSIONS) {
      if (permission.startsWith(`${resource}.`)) granted.add(permission);
    }
  }
  return PLATFORM_PERMISSIONS.filter((p) => granted.has(p));
}

/**
 * May this account do this thing?
 *
 * The predicate §6 names first, and the one every other check here is built from.
 * Deliberately total — a signed-out user, an unknown role and an account with an
 * empty permission list all answer `false` rather than throwing, because a
 * permission check runs during render and a render that throws takes the whole
 * screen with it.
 */
export function hasPermission(
  user: User | null | undefined,
  permission: PlatformPermission,
): boolean {
  return permissionsFor(user).includes(permission);
}

/**
 * The same question asked the other way — `can(user, "orders", "manage")`.
 *
 * §6 asks for both entry points, and this is genuinely the more readable one at a
 * call site that already knows which resource it is about. `PermissionAction<R>`
 * is derived from the slug union in `types/user`, so a verb the resource does not
 * have is a compile error rather than a check that quietly fails open — the one
 * failure mode an authorization layer must not have.
 */
export function can<R extends PermissionResource>(
  user: User | null | undefined,
  resource: R,
  action: PermissionAction<R>,
): boolean {
  return hasPermission(user, `${resource}.${action}` as PlatformPermission);
}

/** Any one of these — for a surface reachable by more than one desk. */
export function hasAnyPermission(
  user: User | null | undefined,
  permissions: readonly PlatformPermission[],
): boolean {
  const held = permissionsFor(user);
  return permissions.some((p) => held.includes(p));
}

/** All of these. Used where an action needs two rights at once. */
export function hasAllPermissions(
  user: User | null | undefined,
  permissions: readonly PlatformPermission[],
): boolean {
  const held = permissionsFor(user);
  return permissions.every((p) => held.includes(p));
}

// ---------------------------------------------------------------------------
// The admin section
// ---------------------------------------------------------------------------

/**
 * The permission that opens each `/admin` route.
 *
 * One table, in the nav's own order, rather than a check per page: the shell reads
 * it to decide what to draw *and* to decide whether the current path is allowed,
 * which is what stops a hidden nav entry from still being reachable by typing the
 * URL. Longest-prefix wins, so `/admin/orders/ord_1` resolves to `orders.view`
 * and bare `/admin` does not swallow it.
 *
 * Every entry is a **view** right. Being able to open the payouts screen is not
 * being able to pay anybody — that is `payouts.manage`, checked at the button.
 */
export const ADMIN_ROUTE_PERMISSIONS: readonly {
  prefix: string;
  permission: PlatformPermission;
}[] = [
  { prefix: "/admin/orders", permission: "orders.view" },
  { prefix: "/admin/support", permission: "support.view" },
  { prefix: "/admin/customers", permission: "customers.view" },
  { prefix: "/admin/restaurants", permission: "restaurants.view" },
  { prefix: "/admin/riders", permission: "riders.view" },
  { prefix: "/admin/payouts", permission: "payouts.view" },
  { prefix: "/admin/coupons", permission: "coupons.manage" },
  { prefix: "/admin/reviews", permission: "reviews.moderate" },
  { prefix: "/admin/audit", permission: "audit.view" },
  // Phase 16: finance, marketing and partner operations already held
  // `analytics.view` with nothing behind it.
  { prefix: "/admin/analytics", permission: "analytics.view" },
  { prefix: "/admin/cms", permission: "content.manage" },
  { prefix: "/admin/notifications", permission: "notifications.send" },
  // Phase 19 (G30): `settings.manage` has been in the vocabulary since Phase 14
  // with no surface behind it — the platform's configuration was `config/regions`
  // and a seeded array, so there was nothing for the right to open.
  { prefix: "/admin/settings", permission: "settings.manage" },
  // The live board, last: it is the shortest prefix and would otherwise match
  // every path above it.
  { prefix: "/admin", permission: "orders.view" },
];

/**
 * Which permission does this admin path need?
 *
 * `null` for a path outside `/admin`, which the shell never asks about but a
 * future middleware might.
 */
export function permissionForAdminPath(pathname: string): PlatformPermission | null {
  const match = ADMIN_ROUTE_PERMISSIONS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );
  return match?.permission ?? null;
}

/**
 * May this account see any part of platform operations?
 *
 * This replaces the shell's old `ADMIN_ROLES` list. The difference is not
 * cosmetic: the role list admitted four roles to every section, whereas this
 * admits an account to the *section* and then `permissionForAdminPath` decides
 * which pages inside it exist for them. A marketing manager now gets in and sees
 * campaigns, broadcasts and content — and no orders, no payouts, no disputes.
 */
export function canOpenAdmin(user: User | null | undefined): boolean {
  return permissionsFor(user).length > 0;
}

/**
 * Where should this account land when it opens `/admin`?
 *
 * The live board needs `orders.view`, which a marketing manager does not have, so
 * "the first section they can actually see" has to be computable — otherwise the
 * only thing that account ever sees is the refusal panel.
 */
export function firstAdminRouteFor(user: User | null | undefined): string | null {
  const held = permissionsFor(user);
  if (held.includes("orders.view")) return "/admin";
  const entry = ADMIN_ROUTE_PERMISSIONS.find((e) => held.includes(e.permission));
  return entry?.prefix ?? null;
}
