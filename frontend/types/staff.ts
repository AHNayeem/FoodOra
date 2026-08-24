import type { BaseEntity, ISODate } from "./common";

/**
 * staff.ts — the people who work at one restaurant (Phase 10, G24).
 *
 * `User.permissions` has existed since the first commit and has never been read;
 * the audit filed that as G24 and §6 notes it depends on G31 (RBAC, Phase 14).
 * This file closes the half that does not depend on it — who works here, in what
 * role, and whether they are still working — and states plainly where the other
 * half stops.
 *
 * Three decisions worth stating, because each is the kind a plausible-looking
 * implementation gets wrong:
 *
 *  - **A staff member is a record, not an account.** There is no mail server and
 *    no way to sign in as somebody the owner invited, so an invitation is a row
 *    that says "this person has been asked", not a login that exists. The screen
 *    says so. Minting a `User` for every invitation would put accounts in the
 *    system that nobody can ever authenticate as, which is worse than an honest
 *    pending row.
 *  - **A role grants permissions; a member does not carry a copy of them.**
 *    `lib/staff.STAFF_PERMISSIONS` is the grant table and
 *    `effectivePermissions` is the one reader. What a member carries is only the
 *    *difference* from their role — `grants` and `revokes` — so "what may a
 *    manager do" has exactly one answer and changing it changes every manager.
 *  - **Enforcement across the platform is Phase 14.** `lib/staff.staffCan` is the
 *    single predicate every surface will ask, and it works today; what does not
 *    exist yet is a session belonging to a staff member for it to be asked about.
 *    The permission editor therefore records intent and says on screen that it
 *    records intent. The precedent is Phase 5's support queue and Phases 6–7's
 *    onboarding queues, both of which declined to ship an assignee column nobody
 *    set.
 */

/**
 * What somebody does here.
 *
 * Restaurant-scoped, and deliberately not `UserRole`: `UserRole` answers "what
 * kind of account is this on the platform" and this answers "what does this person
 * do at this restaurant". A cashier at one branch is not a platform role, and
 * folding the two vocabularies would mean every new job title needed a change to
 * the account model.
 */
export type StaffRole =
  /** The account the restaurant belongs to. Exactly one is required at all times. */
  | "owner"
  | "manager"
  | "kitchen"
  | "cashier"
  | "support";

/**
 * Where an invitation got to.
 *
 * `invited` is separate from `active` because they are different facts: somebody
 * asked has not yet agreed, and a list that showed them as staff would overstate
 * who is actually on the rota.
 */
export type StaffStatus = "invited" | "active" | "inactive";

/**
 * What a person may do. Slugs rather than an enum of screens, so a permission
 * outlives the page that happens to need it today.
 *
 * These are the same free-form strings `User.permissions` was always typed to
 * hold, which is why Phase 14 can adopt them without a type change.
 */
export type StaffPermission =
  | "orders.manage"
  | "kitchen.operate"
  | "menu.manage"
  | "pos.operate"
  | "reservations.manage"
  | "coupons.manage"
  | "reviews.respond"
  | "finance.view"
  | "settings.manage"
  | "staff.manage"
  | "analytics.view";

/** One person on one restaurant's team. */
export interface StaffMember extends BaseEntity {
  vendorId: string;
  name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  status: StaffStatus;
  /**
   * Permissions this person has beyond what their role grants, and permissions
   * withheld from it. The *difference* rather than the full set, so a change to
   * the role's grant reaches everybody who was not explicitly excepted.
   */
  grants: StaffPermission[];
  revokes: StaffPermission[];
  /**
   * The platform account this record belongs to, when there is one. Only the
   * owner's is ever filled in the prototype — see the file header.
   */
  userId: string | null;
  /** Display name of whoever sent the invitation. */
  invitedBy: string;
  invitedAt: ISODate;
  activatedAt: ISODate | null;
  deactivatedAt: ISODate | null;
}
