import { Inject, Injectable, Logger } from '@nestjs/common';

import { RequestContextService } from '../../../common/context';
import { ForbiddenError, RateLimitError } from '../../../common/errors';
import { IdService } from '../../../common/ids';
import { appConfig, type AppConfig } from '../../../config';
import {
  RATE_LIMITER,
  type RateLimiterPort,
  UNIT_OF_WORK,
  type UnitOfWorkPort,
} from '../../../shared/contracts';
import { canHoldSession, isSelfServiceRole, type SelfServiceRole } from '../../../shared/enums';
import { CLOCK, type Clock, fail, ok, type Result } from '../../../shared/kernel';
import { PERMISSION_RESOLUTION, type PermissionResolutionPort } from '../../rbac/domain';
import { REGION_CATALOG, type RegionCatalogPort } from '../../regions/domain';
import {
  AUTH_RATE_LIMITS,
  AuthError,
  type AuthUser,
  CHALLENGE_REPOSITORY,
  type ChallengeRepositoryPort,
  type DeviceHint,
  IDENTITY_REPOSITORY,
  type IdentityRepositoryPort,
  isLocked,
  lockUntil,
  normaliseEmail,
  normalisePhone,
  PASSWORD_HASHER,
  type PasswordHasherPort,
  type SignedIn,
  unlockInSeconds,
} from '../domain';
import { TokenService } from './token.service';

export interface LoginInput {
  email: string;
  password: string;
  rememberMe: boolean;
  device?: DeviceHint;
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string | null;
  password: string;
  role: SelfServiceRole;
  marketingOptIn: boolean;
  device?: DeviceHint;
}

/**
 * Email-and-password sign-in and self-service registration.
 *
 * Keeps `frontend/services/auth.ts::login` and `register` exactly as they are: a
 * `Promise<Result<…>>` whose `error` is an i18n key. Everything that changes is
 * behind that signature.
 */
@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name);

  constructor(
    @Inject(IDENTITY_REPOSITORY) private readonly identity: IdentityRepositoryPort,
    @Inject(CHALLENGE_REPOSITORY) private readonly challenges: ChallengeRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(PERMISSION_RESOLUTION) private readonly permissions: PermissionResolutionPort,
    @Inject(REGION_CATALOG) private readonly regions: RegionCatalogPort,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiterPort,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWorkPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
    private readonly tokens: TokenService,
    private readonly context: RequestContextService,
    private readonly ids: IdService,
  ) {}

  /**
   * One account by id — what `me` resolves to.
   *
   * The permissions come from the actor on the request context rather than from a
   * second resolution here: the guard has already resolved them for this request, and
   * asking twice would double the cost of the most-called query in the API.
   */
  findUser(userId: string): Promise<AuthUser | null> {
    return this.identity.findById(userId);
  }

  /**
   * The password path (D6 §Sign-in methods).
   *
   * Three properties are held throughout, and each one costs something:
   *
   * - **One error for every failure.** "No such account" and "wrong password" are
   *   both `errors.invalidCredentials`, because telling them apart turns a leaked
   *   address list into a verified one.
   * - **Constant time.** A miss still pays for an Argon2 verification against a
   *   dummy hash, otherwise the 2 ms / 250 ms difference is the same oracle with
   *   extra steps.
   * - **Every attempt is recorded**, including attempts on accounts that do not
   *   exist — which is most of what a stuffing run looks like.
   */
  async login(input: LoginInput): Promise<Result<SignedIn>> {
    const now = this.clock.date();
    const email = normaliseEmail(input.email);
    const ip = this.ip();

    await this.enforce(AUTH_RATE_LIMITS.login.perIp, ip ?? 'unknown');
    // Per-account as well as per-IP: the first stops one host trying many
    // accounts, the second stops a botnet trying one. Neither implies the other.
    await this.enforce(AUTH_RATE_LIMITS.login.perAccount, email);

    const user = await this.identity.findByEmail(email);
    if (!user) {
      await this.hasher.verifyDummy(input.password);
      await this.recordAttempt(email, null, 'password', false, AuthError.invalidCredentials, now);
      return fail(AuthError.invalidCredentials, { path: 'input.password' });
    }

    const credential = await this.identity.findCredential(user.id);
    if (!credential) {
      // The account exists but has no password — it was created through phone OTP.
      // Answered as bad credentials rather than "use the OTP tab", because the
      // helpful version confirms the address is registered. The OTP tab is already
      // on the screen.
      await this.hasher.verifyDummy(input.password);
      await this.recordAttempt(email, user.id, 'password', false, AuthError.noPassword, now);
      return fail(AuthError.invalidCredentials, { path: 'input.password' });
    }

    if (isLocked(credential.lockedUntil, now)) {
      const seconds = unlockInSeconds(credential.lockedUntil as Date, now);
      await this.recordAttempt(email, user.id, 'password', false, AuthError.accountLocked, now);
      return fail(AuthError.accountLocked, { params: { unlockInSeconds: seconds } });
    }

    const correct = await this.hasher.verify(credential.passwordHash, input.password);
    if (!correct) {
      const failedCount = await this.identity.incrementFailedCount(user.id);
      const lockedUntil = lockUntil(failedCount, now);
      if (lockedUntil) await this.identity.applyLock(user.id, lockedUntil);

      await this.recordAttempt(
        email,
        user.id,
        'password',
        false,
        lockedUntil ? AuthError.accountLocked : AuthError.invalidCredentials,
        now,
      );

      return lockedUntil
        ? fail(AuthError.accountLocked, {
            params: { unlockInSeconds: unlockInSeconds(lockedUntil, now) },
          })
        : fail(AuthError.invalidCredentials, { path: 'input.password' });
    }

    if (!canHoldSession(user.status)) {
      await this.recordAttempt(email, user.id, 'password', false, AuthError.accountSuspended, now);
      return fail(AuthError.accountSuspended);
    }

    const signedIn = await this.completeSignIn(user, 'password', input.rememberMe, input.device);

    // A correct password forgives what came before it — the failure counter in
    // Postgres and the throttle bucket in Redis both.
    await this.limiter.reset(`${AUTH_RATE_LIMITS.login.perAccount.name}:${email}`);

    // Cost parameters get raised over time; this is the only moment the plaintext
    // is in hand, so it is the only moment an upgrade is possible.
    if (this.hasher.needsRehash(credential.passwordHash)) {
      const upgraded = await this.hasher.hash(input.password);
      await this.identity.rehashPassword(user.id, upgraded, 'argon2id');
    }

    return ok(signedIn);
  }

  /**
   * Self-service registration, and the two things it must not become.
   *
   * It must not become a **privilege-escalation endpoint**: `role` comes from a
   * request body, so it is checked against `SELF_SERVICE_ROLES` here as well as in
   * the input schema. Anything else arriving at this method got past validation,
   * which makes it an attack rather than a typo — hence a thrown `ForbiddenError`
   * and not a form error.
   *
   * And it must not become an **account-enumeration endpoint**. This one is
   * unavoidable: a registration form has to say "that email is taken", and Phase C
   * already returns `errors.emailTaken`. The mitigation is the rate limit, not
   * silence.
   */
  async register(input: RegisterInput): Promise<Result<SignedIn>> {
    const email = normaliseEmail(input.email);
    const phone = input.phone ? normalisePhone(input.phone) : null;

    await this.enforce(AUTH_RATE_LIMITS.register.perIp, this.ip() ?? 'unknown');

    if (!isSelfServiceRole(input.role)) {
      throw new ForbiddenError('errors.forbidden');
    }

    if (await this.identity.emailTaken(email)) {
      return fail(AuthError.emailTaken, { path: 'input.email' });
    }
    if (phone && (await this.identity.phoneTaken(phone))) {
      return fail(AuthError.phoneTaken, { path: 'input.phone' });
    }

    const passwordHash = await this.hasher.hash(input.password);
    const region = await this.region();

    const user = await this.unitOfWork.runInTransaction(() =>
      this.identity.createAccount({
        id: this.ids.next('user'),
        name: input.name.trim(),
        email,
        phone,
        primaryRole: input.role,
        /**
         * `pending`, not `active`: nothing has been verified yet. It is still a
         * signed-in state — the account can browse and order — and the specific
         * actions that need a verified channel are the ones that say so. Blocking
         * sign-in on an email nobody can send yet (E8) would make registration a
         * dead end.
         */
        status: 'pending',
        countryCode: region.countryCode,
        currency: region.currency,
        locale: region.locale,
        timezone: region.timezone,
        passwordHash,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        marketingOptIn: input.marketingOptIn,
        roleAssignmentId: this.ids.next('roleAssignment'),
      }),
    );

    return ok(await this.completeSignIn(user, 'register', true, input.device));
  }

  /**
   * The shared tail of every sign-in path — password, OTP, and social when it
   * lands. One place, so a new entry point cannot forget to record the login or to
   * invalidate an outstanding password-reset link.
   */
  async completeSignIn(
    user: AuthUser,
    method: string,
    rememberMe: boolean,
    device: DeviceHint | undefined,
  ): Promise<SignedIn> {
    const now = this.clock.date();
    const ip = this.ip();

    const authorization = await this.permissions.resolve(user.id);
    // Resolution can only fail if the user vanished between two statements. Not a
    // refusal the product anticipates, so it throws rather than returning a key.
    if (!authorization) throw new ForbiddenError(AuthError.accountNotFound);

    const deviceRecord = await this.unitOfWork.runInTransaction(async () => {
      await this.identity.recordLogin(user.id, now);
      await this.identity.clearFailures(user.id);
      return device ? this.identity.upsertDevice(user.id, device, now) : null;
    });

    const tokens = await this.tokens.startSession(
      user,
      authorization.permissions,
      authorization.permHash,
      {
        rememberMe,
        ip,
        userAgent: this.userAgent(),
        deviceId: deviceRecord?.id ?? null,
      },
    );

    await this.recordAttempt(user.email, user.id, method, true, null, now);

    if (deviceRecord?.isNew) {
      /**
       * `UserSettings.loginAlerts` wants a notification here, and the check is
       * `(userId, installId)` rather than user-agent equality precisely so it does
       * not fire on every browser update. Sending it needs E8; until then the
       * signal is a log line, which is at least something a support engineer can
       * find.
       */
      this.logger.log(
        { userId: user.id, deviceId: deviceRecord.id, platform: deviceRecord.platform },
        'sign-in from a device this account has not used before',
      );
    }

    return { user, permissions: authorization.permissions, tokens };
  }

  /** Throws `RateLimitError` (→ `TOO_MANY_REQUESTS` + `retryAfter`) rather than refusing as data:
   * being throttled is not a decision about the input, and the client's remedy is to wait. */
  private async enforce(
    rule: { name: string; limit: number; windowSeconds: number },
    discriminator: string,
  ): Promise<void> {
    const verdict = await this.limiter.consume(
      `${rule.name}:${discriminator}`,
      rule.limit,
      rule.windowSeconds,
    );
    if (!verdict.allowed) throw new RateLimitError(verdict.retryAfterSeconds);
  }

  private async recordAttempt(
    identifier: string,
    userId: string | null,
    method: string,
    success: boolean,
    reason: string | null,
    at: Date,
  ): Promise<void> {
    await this.challenges.recordLoginAttempt({
      id: this.ids.next('loginAttempt'),
      identifier,
      userId,
      method,
      success,
      reason,
      ip: this.ip(),
      userAgent: this.userAgent(),
      at,
    });
  }

  /**
   * Region for a new account — never a hard-coded Bangladesh (D1 §Multi-country).
   *
   * E2 resolved this from the request headers with the configured defaults as a fallback. E3 puts
   * the **country table** in the middle, which is what makes the platform's multi-country claim
   * data rather than configuration: the country row is what knows that BD prices in BDT, runs on
   * `Asia/Dhaka`, and defaults to Bangla — so a market opened by an operator through
   * `createCountry` produces correctly-configured accounts with no deploy.
   *
   * Header hints still win where they are given, because a visitor who has explicitly chosen a
   * currency or a language should keep it. What the catalogue supplies is the rest, and the
   * platform defaults remain the last resort for a country the table does not know or cannot be
   * reached for — `defaultsFor` never throws, precisely so a signup cannot fail over reference
   * data.
   */
  private async region(): Promise<{
    countryCode: string;
    currency: string;
    locale: string;
    timezone: string | null;
  }> {
    const context = this.context.get();
    const countryCode = context?.countryCode ?? this.app.defaults.countryCode;
    const defaults = await this.regions.defaultsFor(countryCode);

    return {
      countryCode: defaults.countryCode,
      currency: context?.currency ?? defaults.currency,
      locale: context?.locale ?? defaults.locale,
      timezone: context?.timezone ?? defaults.timezone,
    };
  }

  private ip(): string | null {
    return this.context.get()?.ip ?? null;
  }

  private userAgent(): string | null {
    return this.context.get()?.userAgent ?? null;
  }
}
