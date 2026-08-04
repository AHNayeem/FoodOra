export {
  FRESH_SESSION_KEY,
  FreshSession,
  PERMISSIONS_KEY,
  Permissions,
  PUBLIC_KEY,
  Public,
  RATE_LIMIT_KEY,
  RateLimit,
  type RateLimitRule,
  ROLES_KEY,
  Roles,
  VENDOR_SCOPE_KEY,
  VendorScope,
} from './auth.decorators';
export { CurrentUser } from './current-user.decorator';

/**
 * `@Idempotent()` lands with E7, alongside the payment-intent record that gives
 * a replayed mutation something to be idempotent *against*. A decorator with no
 * enforcement behind it reads as protection while providing none, which is worse
 * than not having one.
 */
