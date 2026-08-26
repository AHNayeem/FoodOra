/**
 * Contracts published *between* modules, and from a module to `common/`.
 *
 * A module may import another module's `domain/` and nothing else (D1 §The
 * dependency rule). `common/` may import neither. This folder is the third
 * case: a token plus an interface, owned by nobody, that lets a cross-cutting
 * concern — a guard, a field middleware — depend on a capability while the
 * module that implements it stays free to change.
 *
 * Pure TypeScript. No NestJS, no Prisma, no GraphQL.
 */
export {
  type ActorAuthorization,
  AUTHORIZATION_STATE,
  type AuthorizationStatePort,
  grantsAll,
  PERMISSION_WILDCARD,
} from './authorization-state.contract';
export {
  RATE_LIMITER,
  type RateLimiterPort,
  type RateLimitVerdict,
} from './rate-limiter.contract';
export {
  type RoutePoint,
  ROUTING_PROVIDER,
  type RoutingProviderPort,
} from './routing.contract';
export { SESSION_CONTROL, type SessionControlPort } from './session-control.contract';
export {
  SETTINGS_READER,
  type SettingScopeRef,
  type SettingsReaderPort,
} from './settings.contract';
export {
  type AccessTokenClaims,
  TOKEN_VERIFIER,
  type TokenVerifierPort,
} from './token-verifier.contract';
export { UNIT_OF_WORK, type UnitOfWorkPort } from './unit-of-work.contract';
