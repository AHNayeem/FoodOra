export const RbacError = {
  unknownRole: 'rbac.errors.unknownRole',
  unknownPermission: 'rbac.errors.unknownPermission',
  unknownUser: 'rbac.errors.unknownUser',
  roleExists: 'rbac.errors.roleExists',
  invalidSlug: 'rbac.errors.invalidSlug',

  /** A built-in cannot be renamed, re-ranked or deleted. */
  systemRoleImmutable: 'rbac.errors.systemRoleImmutable',
  /** A role still held by accounts. Move them first — the count is in `params`. */
  roleInUse: 'rbac.errors.roleInUse',

  /**
   * The escalation refusals. All three are the same rule seen from different sides: you
   * cannot hand out authority you do not hold.
   */
  rankTooHigh: 'rbac.errors.rankTooHigh',
  cannotGrantUnheld: 'rbac.errors.cannotGrantUnheld',
  cannotAdministerSelf: 'rbac.errors.cannotAdministerSelf',

  /** The permission is not in `shared/permissions.ts`, so nothing enforces it. */
  notInCatalogue: 'rbac.errors.notInCatalogue',
  /** Already assigned at that scope; the unique index would refuse it anyway. */
  alreadyAssigned: 'rbac.errors.alreadyAssigned',
  notAssigned: 'rbac.errors.notAssigned',
  /** An expiry in the past would create a grant that never applies. */
  expiryInPast: 'rbac.errors.expiryInPast',
} as const;

export type RbacErrorKey = (typeof RbacError)[keyof typeof RbacError];
