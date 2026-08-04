import { Module, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import {
  JwtAuthGuard,
  PermissionsGuard,
  RateLimitGuard,
  RolesGuard,
} from '../../common/guards';
import { assertVocabularyMatches } from '../../infrastructure/prisma';
import { AUTHORIZATION_STATE, SESSION_CONTROL, TOKEN_VERIFIER } from '../../shared/contracts';
import {
  DEVICE_PLATFORMS,
  OTP_CHANNELS,
  OTP_PURPOSES,
  SESSION_REVOKE_REASONS,
} from '../../shared/enums';
import { RbacModule } from '../rbac/rbac.module';
import { RegionsModule } from '../regions/regions.module';
import { AuthenticationService } from './application/authentication.service';
import { AuthorizationStateService } from './application/authorization-state.service';
import { OtpService } from './application/otp.service';
import { PasswordService } from './application/password.service';
import { SessionService } from './application/session.service';
import { TokenService } from './application/token.service';
import {
  AUTH_AUDIT,
  AUTH_CACHE,
  CHALLENGE_REPOSITORY,
  IDENTITY_REPOSITORY,
  OTP_SENDER,
  PASSWORD_HASHER,
  SECRET_GENERATOR,
  SESSION_REPOSITORY,
  TOKEN_SIGNER,
} from './domain';
import { Argon2Hasher } from './infrastructure/argon2.hasher';
import { JoseTokenSigner } from './infrastructure/jose-token-signer';
import { LoggingOtpSender } from './infrastructure/logging-otp-sender';
import { NodeSecretGenerator } from './infrastructure/node-secret-generator';
import { PrismaAuthAuditAdapter } from './infrastructure/prisma-auth-audit.adapter';
import { PrismaChallengeRepository } from './infrastructure/prisma-challenge.repository';
import { PrismaIdentityRepository } from './infrastructure/prisma-identity.repository';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository';
import { RedisAuthCache } from './infrastructure/redis-auth-cache';
import { AuthController } from './presentation/auth.controller';
import { AuthResolver } from './presentation/auth.resolver';
import { JwksController } from './presentation/jwks.controller';

/**
 * Authentication, and the composition root for authorization.
 *
 * ## Why the guards are registered here, and globally
 *
 * `APP_GUARD` in a feature module gives a **global** guard that resolves its
 * dependencies from *this* module's injector — which is what makes it possible for
 * guards living in `common/` to reach `TOKEN_VERIFIER` and `AUTHORIZATION_STATE`
 * without `common/` importing a module (the dependency rule) and without the tokens
 * having to be global.
 *
 * Global rather than per-handler `@UseGuards(...)` — which is how D5's example shows it
 * — inverts the failure mode. A resolver that forgets a decorator is protected by
 * default and needs an explicit `@Public()` to be reachable. Forgetting something should
 * lock a door, not leave one open.
 *
 * **Registration order is execution order**, and it is the order D6 §Guards specifies:
 *
 *     RateLimitGuard → JwtAuthGuard → RolesGuard → PermissionsGuard
 *
 * Throttling first, so an unauthenticated flood never reaches token verification.
 * `VendorScopeGuard` stays opt-in, because only a handler knows where its vendor id is.
 *
 * ## What is not here
 *
 * **Social sign-in.** The brief marks Google, Apple and Facebook "implement later", and
 * they are genuinely absent rather than stubbed: the schema has `SocialIdentity`, D6 has
 * the account-linking rules, and neither is worth half-building. The linking logic is
 * the part with teeth — an unverified email must never be allowed to claim an existing
 * account — and it wants to be written alongside a real provider handshake, not against
 * a placeholder.
 *
 * **Two-factor.** `UserSettings.twoFactor` and `OtpPurpose.two-factor` exist; the
 * `mfa_pending` intermediate token does not. It is deliberately not an access token
 * with reduced scope, and inventing a second token type before anything can enrol in
 * 2FA would be building the risky half first.
 */
@Module({
  // `RegionsModule` (E3) supplies `REGION_CATALOG`, so a new account's country, currency, locale
  // and timezone come from the country table rather than from an environment variable.
  imports: [RbacModule, RegionsModule],
  controllers: [AuthController, JwksController],
  providers: [
    // --- application ---
    AuthenticationService,
    TokenService,
    OtpService,
    PasswordService,
    SessionService,
    AuthorizationStateService,

    // --- ports → adapters. Wiring is by token, never by concrete class. ---
    { provide: IDENTITY_REPOSITORY, useClass: PrismaIdentityRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: CHALLENGE_REPOSITORY, useClass: PrismaChallengeRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2Hasher },
    { provide: TOKEN_SIGNER, useClass: JoseTokenSigner },
    { provide: SECRET_GENERATOR, useClass: NodeSecretGenerator },
    { provide: OTP_SENDER, useClass: LoggingOtpSender },
    { provide: AUTH_CACHE, useClass: RedisAuthCache },
    { provide: AUTH_AUDIT, useClass: PrismaAuthAuditAdapter },

    // --- published contracts, satisfied for the guards in common/ ---
    { provide: TOKEN_VERIFIER, useExisting: TokenService },
    { provide: AUTHORIZATION_STATE, useExisting: AuthorizationStateService },
    /**
     * E3: `UsersModule` needs to end every session when an account is suspended, banned or closed,
     * and may not import this module's `application/` layer to do it. It asks for the capability;
     * `SessionService` is what satisfies it.
     */
    { provide: SESSION_CONTROL, useExisting: SessionService },

    // --- presentation ---
    AuthResolver,

    // --- the guard chain, in order ---
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [TOKEN_VERIFIER, AUTHORIZATION_STATE, SESSION_CONTROL],
})
export class AuthModule implements OnModuleInit {
  /**
   * The `shared/enums` unions and the Postgres enums are two hand-maintained lists of
   * the same facts, and this is the seam where they can drift. Checking at boot turns a
   * silent unmappable value into a startup failure with a diff in it.
   */
  onModuleInit(): void {
    assertVocabularyMatches('DevicePlatform', DEVICE_PLATFORMS);
    assertVocabularyMatches('OtpChannel', OTP_CHANNELS);
    assertVocabularyMatches('SessionRevokeReason', SESSION_REVOKE_REASONS);
    /**
     * `OtpPurpose` is the one intentional mismatch: Postgres also has `delivery`,
     * because the proof-of-delivery code shares the table, and the auth vocabulary
     * deliberately excludes it — a handoff code must not be presentable to
     * `verifyOtp`. So this asserts one direction only.
     */
    assertVocabularyMatches('OtpPurpose', [...OTP_PURPOSES, 'delivery']);
  }
}
