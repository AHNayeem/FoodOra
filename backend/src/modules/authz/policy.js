/**
 * policy.js — the vocabulary a route declares an authorization requirement in.
 *
 * `service.js` answers "what does this account hold?". This answers "is what it
 * holds enough for *this*?", and the split is the one STEP 10 asks for in as many
 * words: a permission check and a resource-scope check are two questions, and a
 * layer that folds them into one is the layer that eventually lets a restaurant
 * owner read another restaurant's orders because they held `orders.view`.
 *
 * ## A requirement
 *
 * ```js
 * {
 *   permission:    "orders.view",         // or permissions: [...] — ALL of them
 *   anyPermission: ["a.view", "b.view"],  // ANY of them
 *   roles:         ["super-admin"],       // ANY of them (role: "x" is sugar)
 *   vendor:        "ven_…" | (request) => id,   // resource scope
 *   staffRole:     ["owner", "manager"],  // ANY, at that vendor
 *   self:          "usr_…" | (request) => id,   // the caller's own resource
 *   platformScope: true,                  // default — see below
 *   hide:          false,                 // deny with 404 instead of 403
 * }
 * ```
 *
 * `permissions` is **all**, not any. That is `plugins/auth.js`'s existing rule and
 * the reason for it is unchanged: a route that needs two rights needs both, and
 * "any" silently *widens* access the first time somebody adds a second argument
 * expecting it to narrow. `anyPermission` exists for the surface reachable by two
 * different desks, and has to be asked for by name.
 *
 * ## The four checks, in order
 *
 *  1. **Identity.** No `request.account` → 401. Not "forbidden": the caller has
 *     not said who they are, and a 403 would tell them to stop trying rather than
 *     to sign in.
 *  2. **Self.** If the requirement names an owner and the caller *is* it, the
 *     answer is yes and nothing else is asked. A customer reading their own order
 *     holds no platform permission at all — `lib/rbac.ts::ROLE_PERMISSIONS`
 *     grants `customer` an empty set on purpose — so anything other than a
 *     short-circuit here would make "your own data" require an admin right.
 *  3. **Permissions and roles**, evaluated *in the requirement's scope*. With no
 *     `vendor` that is the platform scope; with one it is that vendor's, which
 *     is the platform set plus the vendor's own grants minus its own denials.
 *  4. **Resource scope.** With a `vendor`, the caller must also be able to reach
 *     it — owner, active staff, or a vendor-scoped assignment.
 *
 * ## `platformScope`
 *
 * Default `true`, and it decides one question: does a platform desk have to be a
 * member of the vendor it is acting on? On this platform, no — `customer-support`
 * holds `orders.view` precisely so that it can see *every* order, and requiring
 * it to be staff at the restaurant would break the support desk. So a caller who
 * holds the requirement's permissions **platform-wide** (from a `vendorId IS NULL`
 * row) satisfies the scope check without membership.
 *
 * Set it to `false` for the route where even an administrator must be a member.
 * Nothing does today; the flag exists because "may an admin do this to a vendor
 * they do not work for" is a question each future module has to answer, and the
 * answer belongs at the route rather than buried here.
 *
 * A requirement with a `vendor` and **no** permissions at all is membership-only:
 * that is the merchant-dashboard shape, where the right to act comes from working
 * there rather than from a platform grant.
 */

/** Everything a requirement may carry. An unknown key is a typo, and typos fail closed. */
const KNOWN_KEYS = new Set([
  "permission",
  "permissions",
  "anyPermission",
  "role",
  "roles",
  "vendor",
  "staffRole",
  "self",
  "platformScope",
  "hide",
]);

const asList = (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);

/**
 * Validate a requirement once, at route-registration time.
 *
 * `catalogue` is the permission and role vocabulary read out of the database at
 * boot. Checking against it here is what turns `requirePermission("orders.veiw")`
 * from a route that refuses everyone forever into a server that will not start —
 * which is the only moment at which anybody is looking. STEP 7 asks for exactly
 * this: no hard-coded permission that does not exist.
 *
 * The catalogue is skipped when it is empty, because an unseeded database is a
 * deployment problem and refusing to boot over it would make `seed:reference`
 * impossible to run against a fresh server.
 */
export function normalise(requirement, catalogue = { permissions: [], roles: [] }) {
  if (typeof requirement !== "object" || requirement === null) {
    throw new Error("An authorization requirement must be an object.");
  }

  for (const key of Object.keys(requirement)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new Error(`"${key}" is not part of an authorization requirement. Expected one of: ${[...KNOWN_KEYS].join(", ")}.`);
    }
  }

  const all = [...asList(requirement.permission), ...asList(requirement.permissions)];
  const any = asList(requirement.anyPermission);
  const roles = [...asList(requirement.role), ...asList(requirement.roles)];
  const staffRole = asList(requirement.staffRole);

  const known = new Set(catalogue.permissions ?? []);
  if (known.size > 0) {
    for (const slug of [...all, ...any]) {
      if (!known.has(slug)) {
        throw new Error(
          `"${slug}" is not a permission in this database. The catalogue is: ${[...known].join(", ")}.`,
        );
      }
    }
  }

  const knownRoles = new Set(catalogue.roles ?? []);
  if (knownRoles.size > 0) {
    for (const slug of roles) {
      if (!knownRoles.has(slug)) {
        throw new Error(`"${slug}" is not a role in this database. The catalogue is: ${[...knownRoles].join(", ")}.`);
      }
    }
  }

  if (all.length === 0 && any.length === 0 && roles.length === 0 && !requirement.vendor && !requirement.self) {
    throw new Error("An authorization requirement that requires nothing would authorise everything.");
  }

  return Object.freeze({
    all: Object.freeze(all),
    any: Object.freeze(any),
    roles: Object.freeze(roles),
    staffRole: Object.freeze(staffRole),
    vendor: requirement.vendor ?? null,
    self: requirement.self ?? null,
    platformScope: requirement.platformScope !== false,
    hide: requirement.hide === true,
  });
}

/** A `vendor`/`self` field is either a literal id or a function of the request. */
const resolveField = (field, request) => (typeof field === "function" ? field(request) : field);

/**
 * Decide one request against one normalised requirement.
 *
 * Returns a verdict rather than throwing, so that a route handler can ask the
 * same question without an exception — `GET /_authz/check` does, and so will any
 * future endpoint that renders a disabled button. `index.js` turns a refusal into
 * the HTTP error.
 *
 * `reason` is for the server log. It names the check that failed and never the
 * caller's resolved set, which is the STEP 11 line: the client learns *that* it
 * was refused and what the route requires, never what it happens to hold or how
 * the answer was computed.
 */
export async function evaluate({ authz, account, requirement, request }) {
  if (!account?.id) {
    return { allowed: false, status: 401, reason: "unauthenticated" };
  }

  const refuse = (reason) => ({
    allowed: false,
    status: requirement.hide ? 404 : 403,
    reason,
    required: publicRequirement(requirement),
  });

  // 2 — the caller's own resource.
  const self = resolveField(requirement.self, request);
  if (self && self === account.id) {
    return { allowed: true, via: "self" };
  }

  const snapshot = await authz.resolve(account.id);
  if (!snapshot.usable) {
    // `requireUser` refuses these with a 401 long before a guard runs; reaching
    // here means the service was asked directly, and the answer is still no.
    return { allowed: false, status: 401, reason: "account-not-usable" };
  }

  const vendorId = resolveField(requirement.vendor, request) ?? null;
  if (requirement.vendor && !vendorId) {
    return refuse("no-vendor-in-request");
  }

  // 3 — permissions and roles, in the requirement's scope.
  if (requirement.all.length > 0 && !snapshot.hasAll(requirement.all, vendorId)) {
    return refuse("missing-permission");
  }
  if (requirement.any.length > 0 && !snapshot.hasAny(requirement.any, vendorId)) {
    return refuse("missing-permission");
  }
  if (requirement.roles.length > 0 && !snapshot.hasAnyRole(requirement.roles, vendorId)) {
    return refuse("missing-role");
  }

  if (!vendorId) {
    return { allowed: true, via: "platform" };
  }

  // 4 — resource scope. A platform holder of the required rights is not scoped.
  const declaresPermissions = requirement.all.length > 0 || requirement.any.length > 0;
  const platformHolder =
    requirement.platformScope &&
    declaresPermissions &&
    (requirement.all.length === 0 || requirement.all.every((slug) => snapshot.has(slug, null))) &&
    (requirement.any.length === 0 || requirement.any.some((slug) => snapshot.has(slug, null)));

  const access = await authz.vendorAccess(account.id, vendorId);

  if (!access.allowed) {
    if (platformHolder && access.exists) return { allowed: true, via: "platform", access };
    // A vendor that is not there and a vendor that is not yours look the same
    // from outside on purpose — otherwise the refusal enumerates the vendors.
    return refuse(access.reason);
  }

  if (requirement.staffRole.length > 0) {
    // The owner is every role at their own restaurant — `lib/staff.ts` gives
    // `owner` the whole grant table for the same reason.
    const satisfied = access.via === "owner" || requirement.staffRole.includes(access.staffRole);
    if (!satisfied) return refuse("missing-staff-role");
  }

  return { allowed: true, via: access.via, access };
}

/**
 * What the client is allowed to be told about the requirement.
 *
 * The route's own declaration — which is not a secret: `lib/rbac.ts` ships the
 * whole permission table to every browser, and a 403 that will not say what it
 * wanted is a 403 nobody can act on. What is *not* here is the caller's resolved
 * set, the roles behind it, or which of the four checks failed.
 */
function publicRequirement(requirement) {
  const out = {};
  if (requirement.all.length > 0) out.permissions = [...requirement.all];
  if (requirement.any.length > 0) out.anyPermission = [...requirement.any];
  if (requirement.roles.length > 0) out.roles = [...requirement.roles];
  if (requirement.staffRole.length > 0) out.staffRole = [...requirement.staffRole];
  if (requirement.vendor) out.scope = "vendor";
  return out;
}

export default { normalise, evaluate };
