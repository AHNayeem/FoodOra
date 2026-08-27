/**
 * id-prefixes.js — the prefixes this backend mints today.
 *
 * Ids are application-generated (`main.prisma` §1): no column has a generating
 * default, so every `create` supplies one. The prefixes are not decoration —
 * deep links minted during the prototype phase (`/admin/restaurants/ven_…`) keep
 * resolving after the cutover only because the next `ven_` id carries the same
 * prefix, and the frontend's fixtures already use around forty of them.
 *
 * **This registry is deliberately not that list.** Curating all forty here, in a
 * phase that writes none of those rows, would be forty guesses at what each one
 * means. It holds exactly the reference-data prefixes the seeder mints, and each
 * module adds its own when it lands — at which point the frontend fixture it has
 * to match is in front of whoever is writing it.
 *
 * `newId` still refuses anything that is not shaped like a prefix, so an
 * unregistered one is a typo caught at the call site rather than a row that has
 * to be migrated later.
 */
export const ID_PREFIXES = Object.freeze({
  /** Reference data — everything `scripts/seed-reference.js` writes. */
  cmsCollection: "cms_",
  deliveryZone: "dzn_",
  ledgerAccount: "lac_",
  notificationTemplate: "ntt_",
  permission: "prm_",
  paymentProvider: "pvd_",
  role: "rol_",
  taxRule: "tax_",

  /** Module 2 — auth & sessions. `usr_` is the one the frontend fixtures already use. */
  user: "usr_",
  session: "ses_",
  refreshToken: "rft_",
  device: "dev_",
  otpChallenge: "otp_",
  passwordReset: "pwr_",
  loginAttempt: "lga_",
  userRoleAssignment: "ura_",

  /**
   * Module 3 — RBAC / PBAC. The direct-grant layer over the role table.
   *
   * Module 3 itself never writes one: it resolves `role grants ∪ direct grants −
   * denials` and grants nothing. The prefix is registered here because module 3
   * is the module that *owns* `user_permissions` — its tests write the rows, and
   * the admin surface that eventually grants them should not have to invent a
   * prefix while also inventing a permission editor.
   */
  userPermission: "usp_",

  /**
   * Module 4 — catalog & discovery. The two taxonomy tables, and only those.
   *
   * `cus_` and `cat_` are the prefixes `lib/mock/cuisines.ts` and
   * `lib/mock/categories.ts` already use, and the taxonomy seeder mints them
   * from the same natural keys (`deterministicId(prefix, slug)`), so a cuisine
   * is the same row in every database that has run it.
   *
   * **`ven_` and `vbr_` are deliberately absent.** Module 4 *reads* vendors and
   * branches; the module that mints a storefront is onboarding (§3 row 15), and
   * registering a prefix here for rows this module never creates would make the
   * registry a wish list instead of the record of what is written. The catalog
   * tests create their vendor fixtures with an explicit local helper, exactly as
   * module 3's do.
   */
  cuisine: "cus_",
  category: "cat_",
});

/** Every prefix this backend is allowed to mint. Modules extend it as they land. */
export const KNOWN_PREFIXES = Object.freeze(new Set(Object.values(ID_PREFIXES)));

/** `ven_`, `food_`, `addr_` — two to six lower-case letters and an underscore. */
export const PREFIX_PATTERN = /^[a-z]{2,6}_$/;
