/**
 * The users module's published contract.
 */
export type {
  AdminProfilePatch,
  CustomerSettings,
  ProfilePatch,
  SettingsPatch,
  UserFilter,
  UserPage,
  UserProfile,
  UserSortKey,
} from './models';
export {
  type AdminActor,
  type AdminTarget,
  canAdminister,
  isSuperAdminRole,
  statusEndsSessions,
} from './policies/administration.policy';
export {
  attemptedRequiredOptOut,
  defaultSettings,
  enforceRequiredChannels,
  mergeSettings,
} from './policies/settings.policy';
export {
  USER_SETTINGS_REPOSITORY,
  type UserSettingsRepositoryPort,
} from './ports/user-settings.repository.port';
export { USER_REPOSITORY, type UserRepositoryPort } from './ports/user.repository.port';
export { UserError, type UserErrorKey } from './user-errors';
