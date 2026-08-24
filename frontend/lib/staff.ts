import type {
  StaffMember,
  StaffPermission,
  StaffRole,
  StaffStatus,
  User,
  Vendor,
} from "@/types";
import { emailError, phoneError, textError } from "./onboarding";

/**
 * staff.ts — who works at a restaurant, and what their role grants (Phase 10, G24).
 *
 * Pure, like every other `lib/` module: no clock read here, no storage, no store
 * import, no `next-intl`. `stores/staff` commits what these functions return.
 *
 * The design decision this file exists to make explicit is the one §6 flagged: G24
 * depends on G31 (RBAC, Phase 14), so what can honestly be built now?
 *
 * **The grant table can.** `STAFF_PERMISSIONS` is a real answer to "what may a
 * kitchen account do", `effectivePermissions` folds a member's own exceptions over
 * it, and `staffCan` is the one predicate every surface will ask. That predicate
 * works today, is unit-checkable today, and is exactly what Phase 14 will wire
 * into the shells — at which point nothing in this file changes.
 *
 * **A session for a staff member cannot.** There is no mail server, so an
 * invitation is a record saying somebody was asked rather than a login that
 * exists, and there is nobody but the owner to enforce a permission against. The
 * staff screen therefore says on its face that roles are recorded and not yet
 * enforced platform-wide. That is the same call Phase 5 made in declining an
 * assignee column on the support queue and Phases 6–7 made on the onboarding
 * queues: record the fact, do not fake the mechanism.
 */

// ---------------------------------------------------------------------------
// Roles and what they grant
// ---------------------------------------------------------------------------

/** Roles in the order the invite form and the list read them. */
export const STAFF_ROLES: readonly StaffRole[] = [
  "owner",
  "manager",
  "kitchen",
  "cashier",
  "support",
];

/** Every permission, in the order the editor groups them. */
export const STAFF_PERMISSIONS_ALL: readonly StaffPermission[] = [
  "orders.manage",
  "kitchen.operate",
  "menu.manage",
  "pos.operate",
  "reservations.manage",
  "coupons.manage",
  "reviews.respond",
  "analytics.view",
  "finance.view",
  "settings.manage",
  "staff.manage",
];

/**
 * What each role grants.
 *
 * The single answer to "what may a manager do", which is why a member does not
 * carry a copy: changing a line here changes every manager at every restaurant,
 * and a stored copy per person is how a platform ends up with managers hired in
 * March who cannot do what managers hired in April can.
 *
 * The shape of the table is the argument for the roles existing at all — each one
 * is a job somebody actually does at a restaurant, and each has a materially
 * different set. `owner` holds everything, including `staff.manage`, because
 * somebody has to be able to grant it.
 */
export const STAFF_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  owner: STAFF_PERMISSIONS_ALL,
  manager: [
    "orders.manage",
    "kitchen.operate",
    "menu.manage",
    "pos.operate",
    "reservations.manage",
    "coupons.manage",
    "reviews.respond",
    "analytics.view",
  ],
  // The pass. Everything about food leaving the kitchen, nothing about money.
  kitchen: ["orders.manage", "kitchen.operate"],
  // The counter. Takes orders and payments, and seats people.
  cashier: ["orders.manage", "pos.operate", "reservations.manage"],
  // Answers customers. Can see an order and reply to a review; cannot reprice one.
  support: ["orders.manage", "reviews.respond"],
};

/**
 * What this person may actually do.
 *
 * Role grant, plus their `grants`, minus their `revokes` — the fold, and the only
 * reader. A revoke beats a grant, because the two only ever collide through an
 * editing mistake and the safer reading of a contradiction is the narrower one.
 *
 * A member who is not `active` folds to **nothing**. That is the whole point of
 * `activate/deactivate` existing: a deactivated manager who still held
 * `menu.manage` in the permission list would be a suspension that suspended
 * nothing, which is the bug Phase 7 fixed on the rider side by routing suspension
 * through the one availability chokepoint.
 */
export function effectivePermissions(member: StaffMember): StaffPermission[] {
  if (member.status !== "active") return [];
  const granted = new Set<StaffPermission>([
    ...STAFF_PERMISSIONS[member.role],
    ...member.grants,
  ]);
  for (const revoked of member.revokes) granted.delete(revoked);
  return STAFF_PERMISSIONS_ALL.filter((p) => granted.has(p));
}

/**
 * May this person do this thing?
 *
 * The predicate Phase 14 will ask from every shell and every action. It is already
 * correct; what it is waiting for is a session that belongs to a staff member
 * rather than to the restaurant's owner account.
 */
export function staffCan(
  member: StaffMember | null | undefined,
  permission: StaffPermission,
): boolean {
  if (!member) return false;
  return effectivePermissions(member).includes(permission);
}

/** Is this permission on beyond what the role grants — or off despite it? */
export function permissionOrigin(
  member: StaffMember,
  permission: StaffPermission,
): "role" | "granted" | "revoked" | "none" {
  if (member.revokes.includes(permission)) return "revoked";
  if (STAFF_PERMISSIONS[member.role].includes(permission)) return "role";
  if (member.grants.includes(permission)) return "granted";
  return "none";
}

// ---------------------------------------------------------------------------
// The lifecycle
// ---------------------------------------------------------------------------

/**
 * Where an invitation may go next.
 *
 * A graph rather than a boolean, for the reason `VENDOR_TRANSITIONS` is one: an
 * invited person who never turned up is `inactive` without ever having been
 * `active`, and a two-state flag cannot express that. `invited` is not reachable
 * again — somebody who has worked here is deactivated, not un-invited, because the
 * dates on the record are a history.
 */
export const STAFF_TRANSITIONS: Record<StaffStatus, readonly StaffStatus[]> = {
  invited: ["active", "inactive"],
  active: ["inactive"],
  inactive: ["active"],
};

export function canMoveStaff(from: StaffStatus, to: StaffStatus): boolean {
  return STAFF_TRANSITIONS[from].includes(to);
}

/** Statuses the list filters by, in the order the chips read. */
export const STAFF_STATUSES: readonly StaffStatus[] = ["active", "invited", "inactive"];

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type StaffError =
  | "errors.required"
  | "errors.tooShort"
  | "errors.invalidEmail"
  | "errors.invalidPhone"
  | "errors.duplicateEmail"
  | "errors.notFound"
  | "errors.illegalTransition"
  | "errors.lastOwner"
  | "errors.ownerIsAccount";

// ---------------------------------------------------------------------------
// Constructors and moves
// ---------------------------------------------------------------------------

export interface StaffInput {
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
}

/** Normalise an address for comparison — invitations collide case-insensitively. */
function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

function staffFieldErrors(input: StaffInput): Record<string, StaffError> {
  const errors: Record<string, StaffError> = {};
  const name = textError(input.name);
  const email = emailError(input.email);
  // A phone number is optional for a colleague — the email is how they were asked.
  const phone = input.phone.trim() ? phoneError(input.phone) : null;
  if (name) errors.name = name as StaffError;
  if (email) errors.email = email as StaffError;
  if (phone) errors.phone = phone as StaffError;
  return errors;
}

/**
 * A deterministic staff id, from the restaurant and the invite instant.
 *
 * Deterministic for the same reason every other id in this codebase is: a replayed
 * save must produce the same id rather than a second row for one person.
 */
export function staffId(vendorId: string, now: number): string {
  return `stf_${vendorId.replace(/^ven_/, "")}_${now.toString(36)}`;
}

/**
 * Invite somebody.
 *
 * The duplicate-email guard is the one that matters and it is scoped **per
 * restaurant**: the same person may work at two, and refusing that would be a
 * platform rule masquerading as a validation. Within one restaurant a second
 * invitation to the same address is refused rather than silently merged, because
 * the owner needs to be told the person is already on the list — possibly as
 * `inactive`, which is what they actually wanted to change.
 */
export function inviteStaff(
  existing: StaffMember[],
  input: StaffInput,
  context: { vendorId: string; invitedBy: string; now: number },
): { member: StaffMember | null; errors: Record<string, StaffError> } {
  const errors = staffFieldErrors(input);
  if (existing.some((m) => emailKey(m.email) === emailKey(input.email) && !m.deletedAt)) {
    errors.email = "errors.duplicateEmail";
  }
  if (Object.keys(errors).length) return { member: null, errors };

  const iso = new Date(context.now).toISOString();
  return {
    member: {
      id: staffId(context.vendorId, context.now),
      vendorId: context.vendorId,
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone.trim() || null,
      role: input.role,
      status: "invited",
      grants: [],
      revokes: [],
      userId: null,
      invitedBy: context.invitedBy,
      invitedAt: iso,
      activatedAt: null,
      deactivatedAt: null,
      createdAt: iso,
      updatedAt: iso,
      deletedAt: null,
    },
    errors: {},
  };
}

/**
 * The owner's own record.
 *
 * Every restaurant has exactly one, minted from the account that owns the listing
 * the first time the staff screen is opened. It exists so the list is never empty
 * and never lies: the person reading it *is* staff, they are the owner, and the
 * "you cannot remove the last owner" rule needs something to be about.
 *
 * `userId` is filled here and nowhere else — it is the one staff record that
 * corresponds to an account somebody can actually sign in as.
 */
export function ownerRecordFor(
  vendor: Vendor,
  user: Pick<User, "id" | "name" | "email" | "phone">,
  now: number,
): StaffMember {
  const iso = new Date(now).toISOString();
  return {
    // Keyed on the account rather than the clock: the owner record must be the
    // same row on a second device, and a timestamped id would mint a second owner.
    id: `stf_owner_${user.id.replace(/^usr_/, "")}`,
    vendorId: vendor.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: "owner",
    status: "active",
    grants: [],
    revokes: [],
    userId: user.id,
    invitedBy: user.name,
    invitedAt: iso,
    activatedAt: iso,
    deactivatedAt: null,
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  };
}

/** Active owners, which is the set the two guards below protect. */
function activeOwners(members: StaffMember[]): StaffMember[] {
  return members.filter(
    (m) => m.role === "owner" && m.status === "active" && !m.deletedAt,
  );
}

/**
 * Change somebody's details or their role.
 *
 * The guard is the last active owner: their role cannot be changed away from
 * `owner`, because a restaurant with nobody who can manage staff is a restaurant
 * whose settings screen has locked itself, and the prototype has no support desk
 * that could unlock it. Refused in the domain rather than by disabling a dropdown,
 * so every caller gets the same answer.
 */
export function editStaff(
  members: StaffMember[],
  id: string,
  input: StaffInput,
  now: number,
): { members: StaffMember[]; errors: Record<string, StaffError> } {
  const current = members.find((m) => m.id === id && !m.deletedAt);
  if (!current) return { members, errors: { member: "errors.notFound" } };

  const errors = staffFieldErrors(input);
  if (
    members.some(
      (m) => m.id !== id && !m.deletedAt && emailKey(m.email) === emailKey(input.email),
    )
  ) {
    errors.email = "errors.duplicateEmail";
  }
  if (
    current.role === "owner" &&
    input.role !== "owner" &&
    activeOwners(members).length <= 1
  ) {
    errors.role = "errors.lastOwner";
  }
  if (Object.keys(errors).length) return { members, errors };

  const next: StaffMember = {
    ...current,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim() || null,
    role: input.role,
    updatedAt: new Date(now).toISOString(),
  };
  return { members: members.map((m) => (m.id === id ? next : m)), errors: {} };
}

/**
 * Activate or deactivate somebody.
 *
 * Two guards. The graph refuses a move it does not contain — activating somebody
 * already active is not a no-op, it is a mistake worth reporting, because it means
 * the screen and the store disagree. And the last active owner cannot be
 * deactivated, for the reason above.
 *
 * The dates are stamped rather than derived: `activatedAt` is when they started,
 * and it is *not* cleared on deactivation, because a person who worked here in
 * June still worked here in June.
 */
export function setStaffStatus(
  members: StaffMember[],
  id: string,
  to: StaffStatus,
  now: number,
): { members: StaffMember[]; error: StaffError | null } {
  const current = members.find((m) => m.id === id && !m.deletedAt);
  if (!current) return { members, error: "errors.notFound" };
  if (!canMoveStaff(current.status, to)) return { members, error: "errors.illegalTransition" };
  if (
    to === "inactive" &&
    current.role === "owner" &&
    activeOwners(members).length <= 1
  ) {
    return { members, error: "errors.lastOwner" };
  }

  const iso = new Date(now).toISOString();
  const next: StaffMember = {
    ...current,
    status: to,
    activatedAt: to === "active" ? (current.activatedAt ?? iso) : current.activatedAt,
    deactivatedAt: to === "inactive" ? iso : null,
    updatedAt: iso,
  };
  return { members: members.map((m) => (m.id === id ? next : m)), error: null };
}

/**
 * Turn one permission on or off for one person.
 *
 * Stored as the *difference* from the role, which is why this is three cases
 * rather than a set assignment: turning on something the role already grants
 * records nothing (so a later change to the role still reaches them), and turning
 * off something the role grants records a revoke. Collapsing all three into a
 * stored permission list is exactly the copy the header argues against.
 */
export function setStaffPermission(
  members: StaffMember[],
  id: string,
  permission: StaffPermission,
  enabled: boolean,
  now: number,
): { members: StaffMember[]; error: StaffError | null } {
  const current = members.find((m) => m.id === id && !m.deletedAt);
  if (!current) return { members, error: "errors.notFound" };

  const fromRole = STAFF_PERMISSIONS[current.role].includes(permission);
  const grants = current.grants.filter((p) => p !== permission);
  const revokes = current.revokes.filter((p) => p !== permission);
  if (enabled && !fromRole) grants.push(permission);
  if (!enabled && fromRole) revokes.push(permission);

  const next: StaffMember = {
    ...current,
    grants: STAFF_PERMISSIONS_ALL.filter((p) => grants.includes(p)),
    revokes: STAFF_PERMISSIONS_ALL.filter((p) => revokes.includes(p)),
    updatedAt: new Date(now).toISOString(),
  };
  return { members: members.map((m) => (m.id === id ? next : m)), error: null };
}

/**
 * Withdraw an invitation.
 *
 * Only an `invited` record can go, and that restriction is the design: somebody who
 * has worked a shift is deactivated, not deleted, because their record is what
 * explains who was on the pass when an order went wrong. Withdrawing an invitation
 * removes something that never happened, which is the only case where deleting is
 * the honest verb.
 */
export function removeStaff(
  members: StaffMember[],
  id: string,
  now: number,
): { members: StaffMember[]; error: StaffError | null } {
  const current = members.find((m) => m.id === id && !m.deletedAt);
  if (!current) return { members, error: "errors.notFound" };
  if (current.status !== "invited") return { members, error: "errors.illegalTransition" };
  if (current.userId) return { members, error: "errors.ownerIsAccount" };
  return {
    // Soft-deleted, matching every other entity in the prototype (`BaseEntity`).
    members: members.map((m) =>
      m.id === id ? { ...m, deletedAt: new Date(now).toISOString() } : m,
    ),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Reading a team
// ---------------------------------------------------------------------------

/**
 * The team, ordered as the list reads it: active first, then invited, then
 * former colleagues; alphabetically within each group.
 *
 * Ordering here rather than in the component for the same reason
 * `filterSettlements` orders its rows: the sequence is a decision about what the
 * screen is for, and a second surface reading the same store must not have to
 * rediscover it.
 */
export function teamFor(members: StaffMember[], vendorId: string): StaffMember[] {
  const rank: Record<StaffStatus, number> = { active: 0, invited: 1, inactive: 2 };
  return members
    .filter((m) => m.vendorId === vendorId && !m.deletedAt)
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role) ||
        a.name.localeCompare(b.name),
    );
}

/** How many of the team are in each status — the list's counts. */
export function countByStaffStatus(members: StaffMember[]): Record<StaffStatus, number> {
  return {
    active: members.filter((m) => m.status === "active").length,
    invited: members.filter((m) => m.status === "invited").length,
    inactive: members.filter((m) => m.status === "inactive").length,
  };
}
