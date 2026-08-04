import { Inject, Injectable } from '@nestjs/common';

import { RequestContextService } from '../../../common/context';
import { RateLimitError } from '../../../common/errors';
import { IdService } from '../../../common/ids';
import { jwtConfig, type JwtConfig } from '../../../config';
import { RATE_LIMITER, type RateLimiterPort } from '../../../shared/contracts';
import { canHoldSession, type OtpChannel, type OtpPurpose } from '../../../shared/enums';
import { CLOCK, type Clock, fail, ok, type Result } from '../../../shared/kernel';
import {
  AUTH_RATE_LIMITS,
  AuthError,
  CHALLENGE_REPOSITORY,
  type ChallengeRepositoryPort,
  type DeviceHint,
  IDENTITY_REPOSITORY,
  type IdentityRepositoryPort,
  inspectChallenge,
  normaliseEmail,
  normalisePhone,
  OTP_CODE_LENGTH,
  OTP_SENDER,
  type OtpSenderPort,
  resendAfterSeconds,
  SECRET_GENERATOR,
  type SecretGeneratorPort,
  type SignedIn,
} from '../domain';
import { AuthenticationService } from './authentication.service';

export interface RequestOtpInput {
  destination: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
}

export interface RequestOtpResult {
  destination: string;
  expiresAt: Date;
  /** So the UI disables its own resend button with the same number the server enforces. */
  resendAfterSeconds: number;
}

export interface VerifyOtpInput {
  destination: string;
  code: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  device?: DeviceHint;
}

/**
 * One-time codes: issuing, and redeeming.
 *
 * `frontend/services/auth.ts` keeps its shape — `requestOtp(phone)` always
 * resolves, `verifyOtp({ phone, code })` returns a user or
 * `errors.invalidOtp`.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(IDENTITY_REPOSITORY) private readonly identity: IdentityRepositoryPort,
    @Inject(CHALLENGE_REPOSITORY) private readonly challenges: ChallengeRepositoryPort,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGeneratorPort,
    @Inject(OTP_SENDER) private readonly sender: OtpSenderPort,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiterPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(jwtConfig.KEY) private readonly config: JwtConfig,
    private readonly authentication: AuthenticationService,
    private readonly context: RequestContextService,
    private readonly ids: IdService,
  ) {}

  /**
   * Issues a code — and **always reports success**, whether or not the destination
   * belongs to an account.
   *
   * That is not laziness, it is the whole design of the endpoint: an
   * `requestOtp` that refuses unknown numbers is a free "is this person a
   * customer?" lookup for anyone with a phone list. The prototype behaves this way
   * already, and it happens to be correct.
   *
   * The cost of always succeeding is that it must be throttled three ways —
   * per destination per minute, per destination per hour, and per IP per hour —
   * because an unauthenticated endpoint that sends an SMS is an endpoint that
   * spends money.
   */
  async requestOtp(input: RequestOtpInput): Promise<Result<RequestOtpResult>> {
    const now = this.clock.date();
    const destination = this.normalise(input.destination, input.channel);
    const ip = this.context.get()?.ip ?? null;

    await this.enforce(AUTH_RATE_LIMITS.requestOtp.perIpHour, ip ?? 'unknown');
    await this.enforce(AUTH_RATE_LIMITS.requestOtp.perDestinationHour, destination);

    // The burst limit is surfaced as data rather than thrown, because "wait 41
    // seconds" is a normal thing for a resend button to be told.
    const burst = await this.limiter.consume(
      `${AUTH_RATE_LIMITS.requestOtp.perDestinationBurst.name}:${destination}`,
      AUTH_RATE_LIMITS.requestOtp.perDestinationBurst.limit,
      AUTH_RATE_LIMITS.requestOtp.perDestinationBurst.windowSeconds,
    );
    if (!burst.allowed) {
      return fail(AuthError.otpTooSoon, {
        params: { retryAfterSeconds: burst.retryAfterSeconds },
      });
    }

    const user =
      input.channel === 'sms'
        ? await this.identity.findByPhone(destination)
        : await this.identity.findByEmail(destination);

    const code = this.secrets.numericCode(OTP_CODE_LENGTH);
    const expiresAt = new Date(now.getTime() + this.config.otp.ttlSeconds * 1_000);

    await this.challenges.createOtpChallenge({
      id: this.ids.next('otpChallenge'),
      // Recorded when known, so support can see the account's challenges — but a
      // null here is *not* a refusal.
      userId: user?.id ?? null,
      purpose: input.purpose,
      channel: input.channel,
      destination,
      codeHash: this.secrets.hashOtp(code, this.config.otp.pepper),
      maxAttempts: this.config.otp.maxAttempts,
      expiresAt,
      ip,
      createdAt: now,
    });

    await this.sender.send({
      destination,
      channel: input.channel,
      purpose: input.purpose,
      code,
      locale: user?.locale ?? this.context.get()?.locale ?? 'en',
      expiresInSeconds: this.config.otp.ttlSeconds,
    });

    return ok({
      destination,
      expiresAt,
      resendAfterSeconds: AUTH_RATE_LIMITS.requestOtp.perDestinationBurst.windowSeconds,
    });
  }

  /**
   * Redeems a code, and signs the holder in.
   *
   * The match is on `(destination, purpose)` and the **newest** challenge, not on
   * the code alone: a code issued to verify a phone number must not be presentable
   * as a sign-in, which is why `purpose` is part of the challenge's identity rather
   * than a label on it.
   *
   * A wrong code increments `attempts` in Postgres. That counter is the actual
   * defence — a six-digit space falls to brute force in seconds, and five tries is
   * what makes it 1-in-200,000 instead.
   */
  async verifyOtp(input: VerifyOtpInput): Promise<Result<SignedIn>> {
    const now = this.clock.date();
    const destination = this.normalise(input.destination, input.channel);

    const challenge = await this.challenges.findLatestOtpChallenge(destination, input.purpose);
    if (!challenge) return fail(AuthError.otpNotRequested);

    const verdict = inspectChallenge(challenge, now);
    if (!verdict.usable) {
      return fail(
        verdict.reason === 'exhausted' ? AuthError.otpAttemptsExhausted : AuthError.otpExpired,
      );
    }

    const presented = this.secrets.hashOtp(input.code.trim(), this.config.otp.pepper);
    if (!this.secrets.matches(presented, challenge.codeHash)) {
      const attempts = await this.challenges.recordOtpAttempt(challenge.id);
      await this.recordAttempt(destination, challenge.userId, false, AuthError.invalidOtp, now);
      return attempts >= challenge.maxAttempts
        ? fail(AuthError.otpAttemptsExhausted)
        : fail(AuthError.invalidOtp, {
            path: 'input.code',
            params: { attemptsLeft: challenge.maxAttempts - attempts },
          });
    }

    // Conditional consume: two requests presenting the same correct code cannot
    // both win, and the loser is told the code is spent rather than being signed in
    // twice.
    const consumed = await this.challenges.consumeOtpChallenge(challenge.id, now);
    if (!consumed) return fail(AuthError.invalidOtp, { path: 'input.code' });

    const user =
      input.channel === 'sms'
        ? await this.identity.findByPhone(destination)
        : await this.identity.findByEmail(destination);

    /**
     * A correct code for a destination with no account.
     *
     * This is where phone-first *registration* would go, and it is deliberately not
     * here: `User.name` is required and a phone number does not supply one, so the
     * account would be created nameless and every screen that greets the user would
     * have to special-case it. The frontend's OTP tab is a sign-in tab.
     *
     * Saying "no account" only *after* a correct code is not an enumeration leak —
     * proving control of the destination is exactly the bar an oracle cannot clear.
     */
    if (!user) return fail(AuthError.accountNotFound);
    if (!canHoldSession(user.status)) return fail(AuthError.accountSuspended);

    // Redeeming a code proves control of the channel, so record that fact — this is
    // how a `pending` account becomes verified without an email transport existing.
    if (input.channel === 'sms' && user.phoneVerifiedAt === null) {
      await this.identity.markPhoneVerified(user.id, now);
    }
    if (input.channel === 'email' && user.emailVerifiedAt === null) {
      await this.identity.markEmailVerified(user.id, now);
    }

    const refreshed = (await this.identity.findById(user.id)) ?? user;
    return ok(await this.authentication.completeSignIn(refreshed, 'otp', true, input.device));
  }

  /**
   * Seconds until this destination may request another code — read by the UI
   * before it shows a resend button, so the two agree.
   */
  async resendAvailability(destination: string, purpose: OtpPurpose, channel: OtpChannel): Promise<number> {
    const latest = await this.challenges.findLatestOtpChallenge(
      this.normalise(destination, channel),
      purpose,
    );
    return resendAfterSeconds(latest, this.clock.date());
  }

  private normalise(destination: string, channel: OtpChannel): string {
    return channel === 'sms' ? normalisePhone(destination) : normaliseEmail(destination);
  }

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
    success: boolean,
    reason: string | null,
    at: Date,
  ): Promise<void> {
    const context = this.context.get();
    await this.challenges.recordLoginAttempt({
      id: this.ids.next('loginAttempt'),
      identifier,
      userId,
      method: 'otp',
      success,
      reason,
      ip: context?.ip ?? null,
      userAgent: context?.userAgent ?? null,
      at,
    });
  }
}
