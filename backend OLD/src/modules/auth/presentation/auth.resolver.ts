import { Inject } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { FastifyReply } from 'fastify';

import type { Actor } from '../../../common/context';
import { CurrentUser, FreshSession, Public } from '../../../common/decorators';
import { NotFoundError, UnauthenticatedError } from '../../../common/errors';
import { zodPipe } from '../../../common/pipes';
import { appConfig, type AppConfig, jwtConfig, type JwtConfig } from '../../../config';
import { type DataPayload, MutationResult, toPayload, toResult, User } from '../../../graphql';
import type { Result } from '../../../shared/kernel';
import { AuthenticationService } from '../application/authentication.service';
import { OtpService } from '../application/otp.service';
import { PasswordService } from '../application/password.service';
import { SessionService } from '../application/session.service';
import type { AuthUser, SessionRecord, SignedIn } from '../domain';
import { SECRET_GENERATOR, type SecretGeneratorPort } from '../domain';
import { cookieOptionsFrom, setAuthCookies, clearAuthCookies } from './cookies';
import {
  ChangePasswordInput,
  ChangePasswordSchema,
  LoginInput,
  LoginSchema,
  RegisterInput,
  RegisterSchema,
  RequestOtpInput,
  RequestOtpSchema,
  ResetPasswordInput,
  ResetPasswordSchema,
  VerifyOtpInput,
  VerifyOtpSchema,
} from './inputs/auth.inputs';
import {
  AuthPayload,
  type AuthSession,
  type OtpChallengeView,
  OtpPayload,
  SessionView,
} from './models/auth.models';

/** What the driver's `context` factory puts in scope (see `graphql.module.ts`). */
interface GraphqlContext {
  reply: FastifyReply;
}

/**
 * Thin, as a resolver should be: validate, authorize, delegate, map — plus one thing
 * only this layer can do, which is set a cookie.
 *
 * Everything is a **payload type**, never a bare entity, so an expected refusal (bad
 * credentials, a spent code) is data at HTTP 200 and `frontend/services/auth.ts` keeps
 * returning `Promise<Result<User>>` unchanged (D5 §Payload types).
 *
 * `refreshToken` is **not** here, and its absence is deliberate: D5's sketch lists it
 * as a mutation, but D6 scopes the refresh cookie to `/auth`, which means the browser
 * will never send it to `/graphql` — a GraphQL `refreshToken` mutation would be
 * unable to read the credential it needs. It is `POST /auth/refresh` in
 * `auth.controller.ts` instead.
 */
@Resolver(() => User)
export class AuthResolver {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly otp: OtpService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGeneratorPort,
    @Inject(jwtConfig.KEY) private readonly jwt: JwtConfig,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
  ) {}

  // --- queries ---------------------------------------------------------------

  /**
   * The signed-in account. What a client calls on boot to turn a stored access token
   * back into a user.
   *
   * The actor on the request context already holds the resolved permissions — the
   * guard put them there — so this costs one row, not a re-resolution.
   */
  @Query(() => User, { name: 'me', description: 'The signed-in account.' })
  async me(@CurrentUser() actor: Actor | undefined): Promise<User> {
    if (!actor) throw new UnauthenticatedError();
    const user = await this.authentication.findUser(actor.id);
    if (!user) throw new NotFoundError('user');
    return toUserModel(user, actor.permissions);
  }

  /** The account's security screen: every live sign-in, this one flagged. */
  @Query(() => [SessionView], {
    name: 'mySessions',
    description: 'Live sessions for the signed-in account, most recently seen first.',
  })
  async mySessions(@CurrentUser() actor: Actor | undefined): Promise<SessionView[]> {
    if (!actor) throw new UnauthenticatedError();
    const sessions = await this.sessions.listSessions(actor.id);
    return sessions.map((session) => toSessionView(session, actor.sessionId));
  }

  // --- sign in ---------------------------------------------------------------

  @Public()
  @Mutation(() => AuthPayload, { description: 'Email and password sign-in.' })
  async login(
    @Args('input', zodPipe(LoginSchema)) input: LoginInput,
    @Context() context: GraphqlContext,
  ): Promise<DataPayload<AuthSession>> {
    return this.completeAuth(await this.authentication.login(input), context);
  }

  @Public()
  @Mutation(() => AuthPayload, { description: 'Create an account and sign in.' })
  async register(
    @Args('input', zodPipe(RegisterSchema)) input: RegisterInput,
    @Context() context: GraphqlContext,
  ): Promise<DataPayload<AuthSession>> {
    const result = await this.authentication.register({
      ...input,
      phone: input.phone ?? null,
    });
    return this.completeAuth(result, context);
  }

  /**
   * Issues a one-time code. Always succeeds — see `OtpService.requestOtp` for why an
   * endpoint that refuses unknown numbers is an account-enumeration oracle.
   */
  @Public()
  @Mutation(() => OtpPayload, { description: 'Send a one-time code. Always succeeds.' })
  async requestOtp(
    @Args('input', zodPipe(RequestOtpSchema)) input: RequestOtpInput,
  ): Promise<DataPayload<OtpChallengeView>> {
    return toPayload(await this.otp.requestOtp(input));
  }

  @Public()
  @Mutation(() => AuthPayload, { description: 'Redeem a one-time code and sign in.' })
  async verifyOtp(
    @Args('input', zodPipe(VerifyOtpSchema)) input: VerifyOtpInput,
    @Context() context: GraphqlContext,
  ): Promise<DataPayload<AuthSession>> {
    return this.completeAuth(await this.otp.verifyOtp(input), context);
  }

  // --- sign out --------------------------------------------------------------

  /**
   * Sign out. `allDevices` is the "it wasn't me" button.
   *
   * Clears the cookie even when the revocation was a no-op: a client asking to be
   * signed out should end up signed out whatever the server's records say.
   */
  @Mutation(() => MutationResult, { description: 'Revoke this session, or every session.' })
  async logout(
    @CurrentUser() actor: Actor | undefined,
    @Context() context: GraphqlContext,
    @Args('allDevices', { type: () => Boolean, defaultValue: false }) allDevices: boolean,
  ): Promise<MutationResult> {
    if (!actor?.sessionId) throw new UnauthenticatedError();
    const result = await this.sessions.logout(actor.id, actor.sessionId, allDevices);
    clearAuthCookies(context.reply, this.cookieOptions());
    return toResult(result);
  }

  /** Sign out one other device from the security screen. */
  @FreshSession()
  @Mutation(() => MutationResult, { description: 'Revoke one session by id.' })
  async revokeSession(
    @CurrentUser() actor: Actor | undefined,
    @Args('sessionId', { type: () => String }) sessionId: string,
  ): Promise<MutationResult> {
    if (!actor) throw new UnauthenticatedError();
    return toResult(await this.sessions.revokeSession(actor.id, sessionId));
  }

  /** Forget a device: its sessions **and** its push registration, which are one row. */
  @FreshSession()
  @Mutation(() => MutationResult, { description: 'Remove a device and revoke its sessions.' })
  async revokeDevice(
    @CurrentUser() actor: Actor | undefined,
    @Args('deviceId', { type: () => String }) deviceId: string,
  ): Promise<MutationResult> {
    if (!actor) throw new UnauthenticatedError();
    return toResult(await this.sessions.revokeDevice(actor.id, deviceId));
  }

  // --- passwords -------------------------------------------------------------

  /**
   * Change the password. Returns a **new session**, because bumping the token epoch
   * invalidates the access token that authorised this very call — see
   * `PasswordService.changePassword`.
   *
   * `@FreshSession()`: this is precisely the kind of call that must not be servable
   * by a token belonging to a session someone already revoked.
   */
  @FreshSession()
  @Mutation(() => AuthPayload, { description: 'Change the password and replace every session.' })
  async changePassword(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(ChangePasswordSchema)) input: ChangePasswordInput,
    @Context() context: GraphqlContext,
  ): Promise<DataPayload<AuthSession>> {
    if (!actor?.sessionId) throw new UnauthenticatedError();
    const result = await this.passwords.changePassword(
      actor.id,
      actor.sessionId,
      input.currentPassword,
      input.newPassword,
    );
    return this.completeAuth(result, context);
  }

  @Public()
  @Mutation(() => MutationResult, {
    description: 'Start a password reset. Always succeeds — no account enumeration.',
  })
  async requestPasswordReset(
    @Args('email', { type: () => String }) rawEmail: string,
  ): Promise<MutationResult> {
    return toResult(await this.passwords.requestPasswordReset(rawEmail));
  }

  /**
   * Finish a reset. Deliberately does **not** sign the user in: proving control of an
   * inbox is a weaker claim than knowing the password, and typing the new one once
   * more costs a form.
   */
  @Public()
  @Mutation(() => MutationResult, { description: 'Complete a password reset with the emailed token.' })
  async resetPassword(
    @Args('input', zodPipe(ResetPasswordSchema)) input: ResetPasswordInput,
  ): Promise<MutationResult> {
    return toResult(await this.passwords.resetPassword(input.token, input.newPassword));
  }

  // --- mapping ---------------------------------------------------------------

  /**
   * The one place a successful authentication becomes a response: map the payload,
   * and put the refresh token in a cookie rather than in the body.
   *
   * Every sign-in path goes through here, so no path can forget the cookie or leak the
   * token into JSON.
   */
  private completeAuth(
    result: Result<SignedIn>,
    context: GraphqlContext,
  ): DataPayload<AuthSession> {
    if (!result.ok) return toPayload<AuthSession>(result);

    const { user, permissions, tokens } = result.data;

    setAuthCookies(
      context.reply,
      tokens.refreshToken,
      // A fresh CSRF token per sign-in. It is not a secret in the confidentiality
      // sense — it is a value an attacker's origin cannot read, which is all a
      // double-submit check needs.
      this.secrets.token(16),
      tokens.refreshTokenExpiresAt,
      this.cookieOptions(),
    );

    return {
      success: true,
      error: null,
      data: {
        user: toUserModel(user, permissions),
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        sessionId: tokens.sessionId,
      },
    };
  }

  private cookieOptions() {
    return cookieOptionsFrom(this.jwt, this.app.isProduction);
  }
}

/** `AuthUser` → the frontend's `User`. `role` is singular and `permissions` is flat. */
export function toUserModel(user: AuthUser, permissions: readonly string[]): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    role: user.primaryRole,
    permissions: [...permissions],
    status: user.status,
    countryCode: user.countryCode,
    currency: user.currency,
    locale: user.locale,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
  };
}

function toSessionView(session: SessionRecord, currentSessionId?: string): SessionView {
  return {
    id: session.id,
    isCurrent: session.id === currentSessionId,
    platform: session.devicePlatform,
    deviceName: session.deviceName,
    location: session.location,
    ip: session.ip,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    revokeReason: session.revokeReason,
  };
}
