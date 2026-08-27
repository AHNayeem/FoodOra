/**
 * repository.js — every database read authorization makes, and no others.
 *
 * Four reads, and the shape of each is chosen so that a whole authorization
 * decision costs a bounded, knowable number of round trips rather than one per
 * question asked:
 *
 *  - `findGrantGraph` — **one** query returns the account's role assignments,
 *    each role, and every permission each role grants. The join is what makes
 *    "resolve this user's permissions" a single statement instead of a walk down
 *    `user → assignments → roles → role_permissions → permissions`, which is the
 *    per-request explosion STEP 12 asks to avoid;
 *  - `findDirectPermissions` — the PBAC layer: the per-account grants and
 *    denials that sit *over* the role table;
 *  - `findVendorMembership` — ownership and staffing for one vendor, read only
 *    when a route actually asks a vendor-scoped question;
 *  - `listCatalogue` — the permission and role vocabularies, read once at boot
 *    so a typo in `requirePermission("orders.veiw")` fails the server rather
 *    than quietly refusing every request forever.
 *
 * ## Soft delete, and why three filters are written by hand
 *
 * `plugins/prisma.js` adds `deletedAt: null` to top-level reads of a
 * soft-deletable model, and states plainly that it cannot reach a relation
 * loaded through `include`/`select`. `Role` is soft-deletable and is loaded
 * *through* `UserRoleAssignment`, which is not; so a deleted role would keep
 * granting its permissions unless this file filters it, which it does. The same
 * applies to the `Vendor` reached through `VendorStaff`.
 *
 * ## Expiry
 *
 * `UserRoleAssignment.expiresAt` and `UserPermission.expiresAt` are the schema's
 * only "this has stopped applying" column — there is no `revokedAt` on either
 * table, because a revoke there is a deleted row. The `OR` below is the whole
 * of "still in force": null means forever, a future timestamp means not yet
 * over. The comparison happens in PostgreSQL against a timestamp this process
 * supplies, so a clock skew between app and database cannot make an expired
 * assignment look live.
 */

/** Still in force at `now`: never expires, or expires later. */
const unexpired = (now) => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

export function createRepository(prisma) {
  return {
    /**
     * The account, as authorization needs to see it.
     *
     * `requireUser` has already refused a deleted or blocked account by the time
     * a route guard runs, so on the request path this is redundant — but the
     * service is also callable off the request path (`app.authz.permissionsOf`),
     * and an authorization service that answers "yes" for a banned account
     * because nobody happened to check first is not one worth having.
     *
     * Through `$unfiltered()` so a soft-deleted account comes back and can be
     * *refused*: the filtered client would return null, which is the same
     * answer, but for the wrong reason and with no way to tell "no such account"
     * from "account withdrawn" in a log line.
     */
    findAccountState: (userId) =>
      prisma.$unfiltered().user.findUnique({
        where: { id: userId },
        select: { id: true, status: true, deletedAt: true, primaryRole: true },
      }),

    /**
     * Role assignments → roles → role permissions, in one statement.
     *
     * `vendorId` comes back per assignment and is *not* filtered here: a caller
     * asking about one vendor still needs the platform-wide rows, and a second
     * query per scope would defeat the point of the join.
     */
    findGrantGraph: (userId, now = new Date()) =>
      prisma.userRoleAssignment.findMany({
        where: {
          userId,
          ...unexpired(now),
          // See the header: a nested relation is not soft-delete filtered.
          role: { deletedAt: null },
        },
        select: {
          id: true,
          vendorId: true,
          expiresAt: true,
          role: {
            select: {
              id: true,
              slug: true,
              name: true,
              builtin: true,
              rank: true,
              permissions: { select: { permission: { select: { slug: true } } } },
            },
          },
        },
      }),

    /** The per-account layer: `effect: true` grants, `effect: false` denials. */
    findDirectPermissions: (userId, now = new Date()) =>
      prisma.userPermission.findMany({
        where: { userId, ...unexpired(now) },
        select: {
          vendorId: true,
          effect: true,
          permission: { select: { slug: true } },
        },
      }),

    /**
     * Is this account the owner of this vendor, or on its staff?
     *
     * One read of `vendor_staff` and one of `vendors`, both narrow and both
     * indexed (`vendor_staff(userId)`, `vendors(ownerId)`). `VendorStaff` and
     * `Vendor` are soft-deletable and read at top level, so the extension has
     * already excluded removed rows.
     *
     * Returns `null` for the vendor when there is no such vendor, which the
     * service turns into a refusal rather than an error — a route that scopes to
     * a vendor id the caller supplied must not answer differently for "no such
     * vendor" and "not yours" unless it means to.
     */
    findVendorMembership: async (userId, vendorId) => {
      const [vendor, staff] = await Promise.all([
        prisma.vendor.findUnique({
          where: { id: vendorId },
          select: { id: true, ownerId: true, status: true },
        }),
        prisma.vendorStaff.findFirst({
          where: { vendorId, userId },
          select: { id: true, role: true, status: true, branchId: true },
        }),
      ]);
      return { vendor, staff };
    },

    /** Is this account the rider behind this rider record? */
    findRiderProfile: (userId) =>
      prisma.rider.findFirst({ where: { userId }, select: { id: true, status: true } }),

    /** The two vocabularies, read once at boot. See `index.js`. */
    listCatalogue: async () => {
      const [permissions, roles] = await Promise.all([
        prisma.permission.findMany({ select: { slug: true }, orderBy: { slug: "asc" } }),
        prisma.role.findMany({ select: { slug: true }, orderBy: { slug: "asc" } }),
      ]);
      return {
        permissions: permissions.map((row) => row.slug),
        roles: roles.map((row) => row.slug),
      };
    },
  };
}

export default createRepository;
