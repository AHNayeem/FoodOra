import type { UserRole } from '../enums';

/**
 * The claim set of an access token (D6 §Token model).
 *
 * Everything here is a *hint* the server may act on cheaply, not a source of
 * truth it must trust. `role` and `permHash` describe what was true when the
 * token was minted; authorization is still resolved server-side on every
 * request (see `AuthorizationStatePort`). The claims exist so that a request
 * carries its own locale and region without a database read, and so that
 * `epoch` can invalidate the token instantly.
 */
export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session id — what "sign out this device" acts on. */
  sid: string;
  /** Primary role at mint time. */
  role: UserRole;
  /** Fingerprint of the resolved permission set, for drift telemetry. */
  permHash: string;
  countryCode: string;
  currency: string;
  locale: string;
  /**
   * Authorization epoch. A password change or a forced sign-out bumps it, and
   * every token minted before that becomes unverifiable within the same
   * request — which is what stops a stateless token from outliving its session.
   */
  epoch: number;
  /** Key id that signed it, from the JWS header. */
  keyId?: string;
  expiresAt: Date;
  issuedAt: Date;
}

/**
 * A published contract rather than a module export.
 *
 * The guards live in `common/guards` because every module needs
 * `@UseGuards(JwtAuthGuard)` and a module may not import another module's
 * `presentation/` or `application/` — a rule ESLint enforces. So the guard
 * depends on this token, and `AuthModule` is what satisfies it. `common/`
 * therefore knows that access tokens can be verified without knowing that
 * `jose`, Prisma or an `auth` module exist.
 */
export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');

export interface TokenVerifierPort {
  /**
   * Throws `UnauthenticatedError` for anything that is not a currently valid,
   * correctly signed token for this issuer and audience.
   */
  verifyAccessToken(raw: string): Promise<AccessTokenClaims>;
}
