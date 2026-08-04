/**
 * The guards behind `common/decorators/auth.decorators.ts`.
 *
 * They live in `common/` rather than in the auth module because every module
 * needs them and a module may not import another module's `presentation/` — so
 * they depend on `shared/contracts` tokens (`TOKEN_VERIFIER`,
 * `AUTHORIZATION_STATE`, `RATE_LIMITER`) that `AuthModule` satisfies. `common/`
 * therefore knows that tokens can be verified without knowing what verifies them.
 *
 * Registration order, from `AuthModule`, is the execution order (D6 §Guards):
 *
 *     RateLimitGuard → JwtAuthGuard → RolesGuard → PermissionsGuard
 *
 * `VendorScopeGuard` is opt-in via `@UseGuards`, since only the handler knows
 * where its vendor id is.
 */
export {
  bearerTokenOf,
  graphqlArgsOf,
  isRootField,
  replyOf,
  requestOf,
  valueAtPath,
} from './execution-request';
export { JwtAuthGuard } from './jwt-auth.guard';
export { PermissionsGuard } from './permissions.guard';
export { RateLimitGuard } from './rate-limit.guard';
export { RolesGuard } from './roles.guard';
export { VendorScopeGuard } from './vendor-scope.guard';
