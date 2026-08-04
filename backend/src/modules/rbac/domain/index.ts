/**
 * `rbac`'s published surface. A sibling module may import this and nothing else.
 */
export { BUILTIN_ROLES, type BuiltinRole, builtinRole, rankOf } from './builtin-roles';
export type {
  AuthorizationDetail,
  NewRole,
  NewRoleAssignment,
  NewUserPermission,
  PermissionRecord,
  RoleAssignmentRecord,
  RolePatch,
  RoleRecord,
  UserPermissionRecord,
} from './models';
export {
  type DirectGrant,
  fingerprint,
  type ResolutionInput,
  type ResolvedAuthorization,
  resolveAuthorization,
  type RoleGrant,
} from './permission-set';
export {
  type Actor as RbacActor,
  canAdministerRank,
  canGrantPermissions,
  checkExpiry,
  highestRank,
  holdsWildcard,
  isValidRoleSlug,
  notSelf,
} from './policies/escalation.policy';
export {
  AUTHORIZATION_CACHE,
  type AuthorizationCachePort,
} from './ports/authorization-cache.port';
export {
  PERMISSION_RESOLUTION,
  type PermissionResolutionPort,
} from './ports/permission-resolution.port';
export {
  RBAC_REPOSITORY,
  type RbacFacts,
  type RbacRepositoryPort,
} from './ports/rbac.repository.port';
export {
  type PermissionUpsert,
  ROLE_REPOSITORY,
  type RoleRepositoryPort,
} from './ports/role.repository.port';
export { RbacError, type RbacErrorKey } from './rbac-errors';
