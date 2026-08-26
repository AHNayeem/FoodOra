/**
 * The platform's permission catalogue.
 *
 * A `permissions` table with arbitrary rows is not a permission system, it is a
 * free-text column with an index. What makes PBAC usable is a **closed catalogue**:
 *
 * - `@Permissions('users:write')` is checked by the compiler against this list, so
 *   a typo in a guard — the one bug class that silently opens a door, because a
 *   permission nobody holds is a gate nobody passes — cannot ship.
 * - the admin matrix has something to render: a grid needs to know the columns
 *   before anyone has been granted anything.
 * - `syncPermissionCatalogue()` can reconcile the table from code, which is the
 *   right direction of authority. What capabilities *exist* is a fact about the
 *   software; who holds them is a fact about the business. Only the second belongs
 *   in a database an operator edits.
 *
 * Note what is deliberately **not** closed: roles. `Role.isSystem = false` rows let
 * an operator define "Weekend Supervisor" without a deploy (D2 §Role). They compose
 * catalogue permissions; they cannot invent new ones. That asymmetry is the design —
 * a custom role is a bundle of existing capabilities, and a new capability needs code
 * behind it to mean anything at all.
 *
 * Each phase appends its own resources. E3 declares what E3 governs.
 */

export interface PermissionDefinition {
  /** `resource:action`. The form the decorators and the database both use. */
  slug: string;
  resource: string;
  action: string;
  /** For the admin matrix's tooltip. English; the UI translates by slug. */
  description: string;
}

/**
 * Generic in both parameters so the slugs survive as **literal types**, which is
 * the entire point: `A` infers from the keys of the object literal, so
 * `define('users', { read: … })` produces the type `"users:read"` and not `string`.
 * Without that, `@Permissions()` would type-check against `string` and the typo it
 * exists to catch would compile.
 */
function define<R extends string, A extends string>(
  resource: R,
  actions: Record<A, string>,
): Array<{ slug: `${R}:${A}`; resource: R; action: A; description: string }> {
  return (Object.entries(actions) as Array<[A, string]>).map(([action, description]) => ({
    slug: `${resource}:${action}`,
    resource,
    action,
    description,
  }));
}

export const PERMISSION_CATALOGUE = [
  // --- E3: administering the platform itself ---------------------------------
  ...define('users', {
    read: 'View the user directory and any account’s detail.',
    write: 'Edit another account’s profile fields.',
    status: 'Suspend, ban or reinstate an account.',
    delete: 'Close another account, and restore a closed one.',
  }),
  ...define('roles', {
    read: 'View roles and the permissions each one carries.',
    write: 'Create and edit custom roles, and set what a role may do.',
    delete: 'Delete a custom role.',
    assign: 'Grant or revoke a role on an account.',
  }),
  ...define('permissions', {
    read: 'View the permission catalogue.',
    grant: 'Grant or deny a permission directly on one account.',
  }),
  ...define('regions', {
    read: 'View countries, languages and currencies, including inactive ones.',
    write: 'Add or edit a country, language or currency, and toggle availability.',
  }),
  ...define('settings', {
    read: 'View configured settings, including operator-only keys.',
    write: 'Change a setting at platform, country or vendor scope.',
  }),

  /**
   * --- Declared early, because Phase C already displays them -----------------
   *
   * `frontend/lib/mock/users.ts` gives its demo accounts
   * `["vendor:manage", "menu:edit", "orders:view"]` and
   * `["deliveries:accept", "earnings:view"]`, and the account page renders them.
   * The catalogue has to be a superset of what the prototype already shows, or the
   * cutover would quietly shorten that list — a visible regression caused by an
   * invisible omission. The modules that *enforce* these arrive in E4 and E6; the
   * slugs exist now so the seed can grant them and `User.permissions` reads the
   * same before and after.
   */
  ...define('vendor', { manage: 'Manage a vendor’s profile, branches and hours.' }),
  ...define('menu', { edit: 'Edit menu sections, foods and availability.' }),
  ...define('orders', { view: 'View orders for a vendor in scope.' }),
  ...define('deliveries', { accept: 'Accept and complete delivery jobs.' }),
  ...define('earnings', { view: 'View a rider’s own earnings and payouts.' }),
] as const satisfies readonly PermissionDefinition[];

export type PermissionSlug = (typeof PERMISSION_CATALOGUE)[number]['slug'];

export const PERMISSION_SLUGS: readonly PermissionSlug[] = PERMISSION_CATALOGUE.map(
  (permission) => permission.slug,
);

const CATALOGUE_BY_SLUG = new Map<string, PermissionDefinition>(
  PERMISSION_CATALOGUE.map((permission) => [permission.slug, permission]),
);

export function isPermissionSlug(value: string): value is PermissionSlug {
  return CATALOGUE_BY_SLUG.has(value);
}

export function permissionDefinition(slug: string): PermissionDefinition | undefined {
  return CATALOGUE_BY_SLUG.get(slug);
}

/** Every distinct resource, in declaration order — the admin matrix's row groups. */
export const PERMISSION_RESOURCES: readonly string[] = [
  ...new Set(PERMISSION_CATALOGUE.map((permission) => permission.resource)),
];

/**
 * A duplicate slug would make `syncPermissionCatalogue` write one row and leave the
 * other permanently unreachable. Cheap to check, and this module is imported by
 * everything that guards anything, so it is checked at load.
 */
if (CATALOGUE_BY_SLUG.size !== PERMISSION_CATALOGUE.length) {
  const counts = new Map<string, number>();
  for (const { slug } of PERMISSION_CATALOGUE) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([slug]) => slug);
  throw new Error(`Duplicate permission slugs in the catalogue: ${duplicates.join(', ')}`);
}
