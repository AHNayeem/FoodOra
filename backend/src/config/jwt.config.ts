import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

/** `"15m"` → 900. The one place the duration strings become arithmetic. */
export function durationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Not a duration: "${value}". Expected e.g. "15m", "24h", "30d".`);
  const amount = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  return amount * { s: 1, m: 60, h: 3_600, d: 86_400 }[unit];
}

/**
 * Everything E2 needs to sign, verify, hash and expire, resolved once.
 *
 * Durations are exposed **both** as the original string — what `jose`'s
 * `setExpirationTime` accepts — and in seconds, which is what a cookie
 * `Max-Age` and an `expiresAt` calculation need, so no consumer re-parses them.
 */
export const jwtConfig = registerAs('jwt', () => {
  const env = loadEnvironment();
  return {
    /** RS256 — asymmetric, so a verifier never holds signing material. */
    algorithm: 'RS256' as const,
    privateKey: env.JWT_PRIVATE_KEY,
    publicKey: env.JWT_PUBLIC_KEY,
    keyId: env.JWT_KEY_ID,
    /** Honoured for verification and published in JWKS while a rotation is in flight. */
    previousPublicKey: env.JWT_PREVIOUS_PUBLIC_KEY,
    previousKeyId: env.JWT_PREVIOUS_KEY_ID,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTtl: env.ACCESS_TOKEN_TTL,
    accessTtlSeconds: durationToSeconds(env.ACCESS_TOKEN_TTL),
    refreshTtlSeconds: durationToSeconds(env.REFRESH_TOKEN_TTL),
    /** Without "remember me". */
    refreshTtlShortSeconds: durationToSeconds(env.REFRESH_TOKEN_TTL_SHORT),
    passwordResetTtlSeconds: durationToSeconds(env.PASSWORD_RESET_TTL),
    /**
     * How long a completed rotation's result stays replayable, so two tabs
     * refreshing at once do not read as token theft. See
     * `TokenService.rotateRefreshToken`.
     */
    refreshReplayWindowMs: env.REFRESH_REPLAY_WINDOW_MS,
    otp: {
      ttl: env.OTP_TTL,
      ttlSeconds: durationToSeconds(env.OTP_TTL),
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      pepper: env.OTP_PEPPER,
      logCodes: env.OTP_LOG_CODES,
    },
    argon2: {
      memoryCost: env.ARGON2_MEMORY_KIB,
      timeCost: env.ARGON2_TIME_COST,
    },
    cookieDomain: env.COOKIE_DOMAIN,
    /**
     * The refresh cookie's `Path`. `/auth` means the browser never sends it to
     * `/graphql`, so that endpoint is not cookie-authenticated and therefore
     * not CSRF-able (D6 §Cookies).
     */
    cookiePath: env.AUTH_COOKIE_PATH,
    social: {
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
      apple: {
        clientId: env.APPLE_CLIENT_ID,
        teamId: env.APPLE_TEAM_ID,
        keyId: env.APPLE_KEY_ID,
        privateKey: env.APPLE_PRIVATE_KEY,
      },
      facebook: { appId: env.FACEBOOK_APP_ID, appSecret: env.FACEBOOK_APP_SECRET },
    },
  } as const;
});

export type JwtConfig = ReturnType<typeof jwtConfig>;
