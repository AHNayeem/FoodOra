/**
 * service.js — "what may this account do?", answered from the database.
 *
 * The whole of module 3's logic is here. `index.js` is wiring, `policy.js` is
 * the vocabulary a route declares a requirement in, and `routes.js` exists only
 * so the behaviour can be driven end to end before any business module does.
 *
 * ## The resolution, in one line
 *
 * BACKEND-REQUIREMENTS §3 module 3 states it exactly:
 *
 *     effective = role grants ∪ direct grants − denials
 *
 * expanded from `user_role_assignments → roles → role_permissions →
 * permissions`, with `user_permissions` layered over the top. Both layers carry
 * an optional `vendorId`, and that column is the entire PBAC story: a row with
 * `vendorId = NULL` is platform-wide and applies everywhere, a row with a vendor
 * applies inside that vendor and nowhere else.
 *
 * A **denial beats a grant** (`identity.prisma` says so on `UserPermission`), and
 * it beats it at its own reach: a platform denial removes the permission in every
 * scope, a vendor denial removes it in that vendor only. The other order —
 * grant-wins — would make an explicit "this person may not touch payouts"
 * unwritable, which is the only reason the `effect` column exists.
 *
 * Worth knowing before reading the fold below and wondering when the tie-break
 * fires: **within one scope it cannot.** The partial unique indexes the schema
 * describes — `user_permissions_platform_uq` on `(user_id, permission_id) WHERE
 * vendor_id IS NULL`, and the plain `@@unique` for the vendor case — make a
 * grant and a denial of the same permission at the same reach unwritable. So
 * precedence only ever decides a *cross-scope* collision: a platform denial
 * against a vendor's role grant. The rule lives in the database where it can,
 * and here where it cannot.
 *
 * ## Roles are read, never believed
 *
 * Nothing here reads `request.user.roles` or `request.user.permissions`. Those
 * are JWT claims: M2 mints them from `User.primaryRole` with `permissions: []`,
 * and a claim is a statement the token made fifteen minutes ago about an account
 * whose role assignments may have changed twice since. `User.primaryRole` itself
 * is not consulted either — `identity.prisma` calls it the backing field for the
 * frontend's `User.role` and says in as many words that "the authoritative set
 * lives in `roles`". So the authoritative set is what is read: the assignment
 * rows, joined to roles that are not soft-deleted, that have not expired.
 *
 * ## What "revoked" and "inactive" mean here
 *
 * The schema gives an assignment exactly one lifecycle column, `expiresAt`. So:
 *
 *  - **expired** — `expiresAt` in the past. The row stays as a record of what was
 *    once true and grants nothing;
 *  - **revoked** — the row is gone. There is no `revokedAt` to set, and inventing
 *    one in this module would be a schema change the database phase did not make;
 *  - **invalid** — the `Role` behind it is soft-deleted. The assignment survives
 *    the role, and grants nothing, because the join filters it.
 *
 * All three resolve to "grants nothing", by three different routes, and all three
 * are tested.
 *
 * ## The cache
 *
 * STEP 12 bans Redis and asks for the per-request explosion to be avoided anyway.
 * What is here is a plain `Map` with a TTL (`AUTHZ_CACHE_TTL_MS`, default 5s) and
 * an explicit `invalidate(userId)` for the module that will eventually grant and
 * revoke roles. Three things make it safe rather than merely fast:
 *
 *  1. **It caches a resolution, not a decision.** The snapshot holds the sets;
 *     every `has`/`hasRole`/`authorize` still runs against them.
 *  2. **Account state is not cached into a "yes".** `requireUser` re-reads the
 *     account on every single request and refuses a suspended, banned, deleted or
 *     signed-out one with a 401 before any guard here runs. The cache can
 *     therefore never keep a blocked account authorised — the worst it can do is
 *     hold a stale *permission* set for up to the TTL.
 *  3. **Five seconds is the stated consistency bound.** A role granted or revoked
 *     by an operator takes effect within it, or immediately if that operator's
 *     module calls `invalidate`. Setting the variable to `0` turns the cache off
 *     entirely, which is what the test suite does so that every assertion below
 *     is a statement about the database rather than about a Map.
 */
import { toApiEnum } from "../../shared/utils/enums.js";

/** The scope key for "platform-wide". `null` is also accepted by every entry point. */
export const PLATFORM = null;

/** Bound on the number of accounts held at once — an authorization cache is not a session store. */
const MAX_CACHED = 5_000;

/** A `UserStatus` that may still act. Mirrors `modules/auth/service.js::accountRefusal`. */
const USABLE_STATUSES = new Set(["active", "pending"]);

/** Vendor staff that is not `active` folds to nothing — `lib/staff.ts::effectivePermissions`. */
const ACTIVE_STAFF = "active";

/** Separator for the `(user, vendor)` membership key. A space cannot occur in an id. */
const KEY_SEP = " ";

const sorted = (set) => [...set].sort();

/**
 * Does a row with this `vendorId` apply when the question is about `scope`?
 *
 * Platform rows apply everywhere; a vendor row applies to its own vendor. This
 * one predicate is the whole of scope propagation, and writing it once is the
 * reason a vendor-scoped denial cannot accidentally leak into another vendor.
 */
const appliesTo = (rowVendorId, scope) => rowVendorId === null || rowVendorId === scope;

export function createService({ repo, ttlMs = 0, log = null }) {
  /** `userId` → resolution. Insertion-ordered, so the oldest entry evicts first. */
  const snapshots = new Map();
  /** `userId + " " + vendorId` → membership. Cleared with the snapshot. */
  const memberships = new Map();

  const live = (entry) => Boolean(entry) && ttlMs !== 0 && entry.expiresAt > Date.now();

  function remember(store, key, value) {
    if (ttlMs === 0) return value;
    if (store.size >= MAX_CACHED) store.delete(store.keys().next().value);
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  function cached(store, key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (!live(entry)) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  // ---------------------------------------------------------------------------
  // The snapshot
  // ---------------------------------------------------------------------------

  /**
   * Build the authorization snapshot for one account.
   *
   * Three queries at most, whatever the answer turns out to be. The sets for
   * every scope the account has a row in are computed lazily but memoised on the
   * snapshot, which is what lets `has()` be synchronous at the call site.
   */
  async function build(userId) {
    const account = await repo.findAccountState(userId);
    const status = account ? toApiEnum("UserStatus", account.status) : null;
    const usable = Boolean(account) && !account.deletedAt && USABLE_STATUSES.has(status);

    // An account that may not act holds nothing. Reading its grants anyway would
    // produce a set a caller could mistake for one it may use.
    if (!usable) {
      return snapshot({ userId, status, exists: Boolean(account), usable: false, assignments: [], direct: [] });
    }

    const now = new Date();
    const [assignments, direct] = await Promise.all([
      repo.findGrantGraph(userId, now),
      repo.findDirectPermissions(userId, now),
    ]);

    return snapshot({ userId, status, exists: true, usable: true, assignments, direct });
  }

  function snapshot({ userId, status, exists, usable, assignments, direct }) {
    const roles = assignments.map((assignment) => ({
      slug: assignment.role.slug,
      name: assignment.role.name,
      builtin: assignment.role.builtin ? toApiEnum("UserRoleSlug", assignment.role.builtin) : null,
      rank: assignment.role.rank,
      /** `null` = platform-wide. */
      vendorId: assignment.vendorId,
      expiresAt: assignment.expiresAt ? assignment.expiresAt.toISOString() : null,
      grants: assignment.role.permissions.map((row) => row.permission.slug),
    }));

    const grants = direct
      .filter((row) => row.effect)
      .map((row) => ({ slug: row.permission.slug, vendorId: row.vendorId }));
    const denials = direct
      .filter((row) => !row.effect)
      .map((row) => ({ slug: row.permission.slug, vendorId: row.vendorId }));

    /** Every vendor this account has *any* scoped row for — the scopes worth precomputing. */
    const vendorIds = [
      ...new Set([...roles, ...grants, ...denials].map((row) => row.vendorId).filter((id) => id !== null)),
    ].sort();

    /** `scope → string[]`, memoised. `""` stands in for the platform's `null` key. */
    const byScope = new Map();

    function permissionsIn(scope = PLATFORM) {
      const key = scope ?? "";
      const known = byScope.get(key);
      if (known) return known;

      const granted = new Set();
      for (const role of roles) {
        if (!appliesTo(role.vendorId, scope)) continue;
        for (const slug of role.grants) granted.add(slug);
      }
      for (const grant of grants) {
        if (appliesTo(grant.vendorId, scope)) granted.add(grant.slug);
      }
      for (const denial of denials) {
        if (appliesTo(denial.vendorId, scope)) granted.delete(denial.slug);
      }

      const list = Object.freeze(sorted(granted));
      byScope.set(key, list);
      return list;
    }

    function rolesIn(scope = PLATFORM) {
      return roles.filter((role) => appliesTo(role.vendorId, scope));
    }

    return Object.freeze({
      userId,
      exists,
      usable,
      status,

      /** Every assignment, platform-wide and vendor-scoped, with what each grants. */
      roles,
      /** Vendors this account holds a scoped role or grant in. Not "vendors it may access". */
      vendorIds,

      /** Platform-scope effective permissions — the set `/auth/me` reports. */
      get permissions() {
        return permissionsIn(PLATFORM);
      },

      permissionsIn,
      rolesIn,

      has: (permission, scope = PLATFORM) => permissionsIn(scope).includes(permission),
      /** All of them. A route needing two rights needs both — see `policy.js`. */
      hasAll: (list, scope = PLATFORM) => list.every((slug) => permissionsIn(scope).includes(slug)),
      hasAny: (list, scope = PLATFORM) => list.some((slug) => permissionsIn(scope).includes(slug)),

      hasRole: (slug, scope = PLATFORM) => rolesIn(scope).some((role) => role.slug === slug),
      hasAnyRole: (list, scope = PLATFORM) => {
        const held = new Set(rolesIn(scope).map((role) => role.slug));
        return list.some((slug) => held.has(slug));
      },
      hasAllRoles: (list, scope = PLATFORM) => {
        const held = new Set(rolesIn(scope).map((role) => role.slug));
        return list.every((slug) => held.has(slug));
      },

      /** The highest `rank` held in this scope — `Role.rank`'s stated purpose. */
      rankIn: (scope = PLATFORM) => rolesIn(scope).reduce((top, role) => Math.max(top, role.rank ?? 0), 0),
    });
  }

  // ---------------------------------------------------------------------------
  // Entry points
  // ---------------------------------------------------------------------------

  /** The snapshot for an account, from cache when it is fresh. */
  async function resolve(userId) {
    if (!userId) throw new Error("authz.resolve requires a user id");
    const hit = cached(snapshots, userId);
    if (hit) return hit;
    return remember(snapshots, userId, await build(userId));
  }

  /** Platform-scope effective permissions. What `toUserReadModel` reports. */
  const permissionsOf = async (userId, scope = PLATFORM) => (await resolve(userId)).permissionsIn(scope);

  /** Role slugs held in a scope. */
  const rolesOf = async (userId, scope = PLATFORM) =>
    (await resolve(userId)).rolesIn(scope).map((role) => role.slug);

  // ---------------------------------------------------------------------------
  // Resource scope — PBAC
  // ---------------------------------------------------------------------------

  /**
   * May this account act on this vendor at all, and by what right?
   *
   * The three memberships the database actually models, in the order the product
   * reads them:
   *
   *  - **owner** — `Vendor.ownerId`. The account the restaurant belongs to;
   *  - **staff** — an `active` `VendorStaff` row. `invited` and `inactive` grant
   *    nothing, which is the same rule `lib/staff.ts::effectivePermissions`
   *    applies on the merchant dashboard: a deactivated manager who still held
   *    rights would be a suspension that suspended nothing;
   *  - **assignment** — a `UserRoleAssignment` or `UserPermission` carrying this
   *    `vendorId`. `identity.prisma` calls this the point of the column: it is
   *    what makes "manager of *this* branch" expressible without a second
   *    permission system.
   *
   * A platform desk is deliberately **not** decided here. Whether holding
   * `orders.view` platform-wide lets support open this vendor's orders is a
   * question about the requirement, not about membership, and `policy.js` answers
   * it where the requirement is evaluated.
   *
   * A vendor that does not exist — or that has been soft-deleted, which the
   * Prisma extension makes indistinguishable — is `{ allowed: false, exists: false }`.
   * The caller decides whether that is a 403 or a 404; see `policy.js`.
   */
  async function vendorAccess(userId, vendorId) {
    if (!vendorId) throw new Error("authz.vendorAccess requires a vendor id");
    const key = `${userId}${KEY_SEP}${vendorId}`;
    const hit = cached(memberships, key);
    if (hit) return hit;

    const [snap, membership] = await Promise.all([
      resolve(userId),
      repo.findVendorMembership(userId, vendorId),
    ]);
    const { vendor, staff } = membership;

    const deny = (reason) =>
      Object.freeze({
        allowed: false,
        via: null,
        vendorId,
        exists: Boolean(vendor),
        staffRole: null,
        branchId: null,
        reason,
      });

    if (!snap.usable) return remember(memberships, key, deny("account"));
    if (!vendor) return remember(memberships, key, deny("no-vendor"));

    let access = null;
    if (vendor.ownerId && vendor.ownerId === userId) {
      access = { via: "owner", staffRole: null, branchId: null };
    } else if (staff && toApiEnum("StaffStatusKind", staff.status) === ACTIVE_STAFF) {
      access = {
        via: "staff",
        staffRole: toApiEnum("StaffRoleKind", staff.role),
        /** `null` = every branch. `catalog.prisma` on `VendorStaff.branchId`. */
        branchId: staff.branchId,
      };
    } else if (snap.vendorIds.includes(vendorId)) {
      access = { via: "assignment", staffRole: null, branchId: null };
    }

    if (!access) return remember(memberships, key, deny("not-a-member"));

    return remember(
      memberships,
      key,
      Object.freeze({ allowed: true, vendorId, exists: true, reason: null, ...access }),
    );
  }

  /** The rider record behind this account, or null. The delivery module's scope root. */
  const riderProfileOf = (userId) => repo.findRiderProfile(userId);

  // ---------------------------------------------------------------------------
  // Cache control
  // ---------------------------------------------------------------------------

  /** Drop everything held for one account. Call it after granting or revoking. */
  function invalidate(userId) {
    snapshots.delete(userId);
    const prefix = `${userId}${KEY_SEP}`;
    for (const key of memberships.keys()) {
      if (key.startsWith(prefix)) memberships.delete(key);
    }
    log?.debug?.({ userId }, "authorization cache invalidated");
  }

  function invalidateAll() {
    snapshots.clear();
    memberships.clear();
  }

  return {
    PLATFORM,
    ttlMs,
    resolve,
    permissionsOf,
    rolesOf,
    vendorAccess,
    riderProfileOf,
    invalidate,
    invalidateAll,
    /** Observability, not policy — `/health` has no business reporting cache sizes. */
    stats: () => ({ snapshots: snapshots.size, memberships: memberships.size, ttlMs }),
  };
}

export default createService;
