/**
 * E2's verification harness.
 *
 *   bun run verify:auth
 *
 * This machine has no PostgreSQL and no Redis, so the parts of E2 that can be proved
 * are proved here rather than described as working: the cryptography, the rotation
 * chain with its reuse detection, the lockout ladder, the pure authorization algebra,
 * and the enum codec that stands between the schema's `RESTAURANT_OWNER` and the
 * frontend's `restaurant-owner`.
 *
 * The repositories are **in-memory fakes behind the real ports**, which is exactly what
 * ports-and-adapters buys: `TokenService`'s reuse detection is a decision about
 * conditional updates and orderings, and it can be exercised without a database
 * precisely because it never mentions one. What is *not* proved here is the SQL — the
 * conditional `updateMany` predicates that make those orderings atomic under real
 * concurrency. Those need Postgres, and E11 is where they get it.
 *
 * Deliberately not a test framework: E11 owns the committed suite. This is a script
 * with assertions, in the shape of E1's extension harness.
 */
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/foodora';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.OTP_PEPPER ??= 'harness-pepper';

import { Argon2Hasher } from '../src/modules/auth/infrastructure/argon2.hasher';
import { JoseTokenSigner } from '../src/modules/auth/infrastructure/jose-token-signer';
import { NodeSecretGenerator } from '../src/modules/auth/infrastructure/node-secret-generator';
import { TokenService } from '../src/modules/auth/application/token.service';
import { AuthenticationService } from '../src/modules/auth/application/authentication.service';
import {
  AuthError,
  type AuthCachePort,
  type AuthAuditPort,
  type AuthUser,
  type ChallengeRepositoryPort,
  type CredentialRecord,
  type IdentityRepositoryPort,
  type NewAccount,
  type NewLoginAttempt,
  type NewOtpChallenge,
  type NewPasswordReset,
  type NewRefreshToken,
  type NewSession,
  type OtpChallengeRecord,
  type PasswordResetRecord,
  type RefreshTokenRecord,
  type RotationReplay,
  type SessionRecord,
  type SessionRepositoryPort,
  inspectChallenge,
  isLocked,
  lockUntil,
  normaliseEmail,
  normalisePhone,
  resendAfterSeconds,
  UNUSABLE_PASSWORD_HASH,
  unlockInSeconds,
} from '../src/modules/auth/domain';
import { fingerprint, resolveAuthorization } from '../src/modules/rbac/domain';
import { grantsAll, PERMISSION_WILDCARD } from '../src/shared/contracts';
import { FakeClock } from '../src/shared/kernel';
import { IdService } from '../src/common/ids';
import { jwtConfig } from '../src/config';
import { assertVocabularyMatches, enumCodec } from '../src/infrastructure/prisma';
import { OTP_CHANNELS, USER_ROLES } from '../src/shared/enums';
import {
  clearAuthCookies,
  cookieOptionsFrom,
  readCookie,
  setAuthCookies,
} from '../src/modules/auth/presentation/cookies';

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(label);
  console.error(`  ✗ ${label}`);
}

function equal<T>(label: string, actual: T, expected: T): void {
  check(`${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`, actual === expected);
}

async function throws(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    check(`${label} — expected a throw`, false);
  } catch {
    check(label, true);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
// Fakes. Each one implements a real port, so a signature change breaks this file.
// ---------------------------------------------------------------------------

const NOW = Date.parse('2026-08-03T10:00:00.000Z');

class FakeIdentity implements IdentityRepositoryPort {
  users = new Map<string, AuthUser>();
  credentials = new Map<string, CredentialRecord>();
  epochBumps = 0;
  rehashes = 0;

  seed(user: Partial<AuthUser> & { id: string; email: string }, passwordHash?: string): AuthUser {
    const full: AuthUser = {
      name: 'Seed User',
      phone: null,
      avatar: '',
      primaryRole: 'customer',
      status: 'active',
      countryCode: 'BD',
      currency: 'BDT',
      locale: 'en',
      timezone: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      isVerified: false,
      lastLoginAt: null,
      marketingOptIn: false,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
      deletedAt: null,
      ...user,
    };
    this.users.set(full.id, full);
    if (passwordHash) {
      this.credentials.set(full.id, {
        userId: full.id,
        passwordHash,
        algorithm: 'argon2id',
        tokenEpoch: 0,
        failedCount: 0,
        lockedUntil: null,
        changedAt: new Date(NOW),
      });
    }
    return full;
  }

  async findById(id: string) {
    return this.users.get(id) ?? null;
  }
  async findByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async findByPhone(phone: string) {
    return [...this.users.values()].find((u) => u.phone === phone) ?? null;
  }
  async emailTaken(email: string) {
    return (await this.findByEmail(email)) !== null;
  }
  async phoneTaken(phone: string) {
    return (await this.findByPhone(phone)) !== null;
  }
  async createAccount(input: NewAccount) {
    return this.seed(
      { ...input, avatar: '', isVerified: false, lastLoginAt: null },
      input.passwordHash ?? undefined,
    );
  }
  async findCredential(userId: string) {
    const record = this.credentials.get(userId);
    if (!record || record.passwordHash === UNUSABLE_PASSWORD_HASH) return null;
    return record;
  }
  async incrementFailedCount(userId: string) {
    const record = this.credentials.get(userId)!;
    record.failedCount += 1;
    return record.failedCount;
  }
  async applyLock(userId: string, lockedUntil: Date | null) {
    this.credentials.get(userId)!.lockedUntil = lockedUntil;
  }
  async clearFailures(userId: string) {
    const record = this.credentials.get(userId);
    if (record) {
      record.failedCount = 0;
      record.lockedUntil = null;
    }
  }
  async setPassword(userId: string, passwordHash: string, algorithm: string) {
    const record = this.credentials.get(userId);
    if (record) {
      record.passwordHash = passwordHash;
      record.algorithm = algorithm;
      record.tokenEpoch += 1;
      return record.tokenEpoch;
    }
    this.credentials.set(userId, {
      userId,
      passwordHash,
      algorithm,
      tokenEpoch: 1,
      failedCount: 0,
      lockedUntil: null,
      changedAt: new Date(NOW),
    });
    return 1;
  }
  async rehashPassword(userId: string, passwordHash: string) {
    this.rehashes += 1;
    const record = this.credentials.get(userId);
    if (record) record.passwordHash = passwordHash;
  }
  async bumpTokenEpoch(userId: string) {
    this.epochBumps += 1;
    const record = this.credentials.get(userId)!;
    record.tokenEpoch += 1;
    return record.tokenEpoch;
  }
  async currentTokenEpoch(userId: string) {
    return this.credentials.get(userId)?.tokenEpoch ?? 0;
  }
  async recordLogin(userId: string, at: Date) {
    const user = this.users.get(userId);
    if (user) user.lastLoginAt = at;
  }
  async markEmailVerified() {}
  async markPhoneVerified() {}
  async upsertDevice() {
    return null;
  }
  async revokeDevice() {
    return false;
  }
}

class FakeSessions implements SessionRepositoryPort {
  sessions = new Map<string, SessionRecord>();
  tokens = new Map<string, RefreshTokenRecord>();

  async createSession(input: NewSession) {
    const record: SessionRecord = {
      ...input,
      location: null,
      lastSeenAt: input.createdAt,
      revokedAt: null,
      revokeReason: null,
      devicePlatform: null,
      deviceName: null,
    };
    this.sessions.set(record.id, record);
    return record;
  }
  async findSession(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async listActiveSessions(userId: string, now: Date) {
    return [...this.sessions.values()].filter(
      (s) => s.userId === userId && s.revokedAt === null && s.expiresAt > now,
    );
  }
  async touchSession(id: string, at: Date) {
    const session = this.sessions.get(id);
    if (session) session.lastSeenAt = at;
  }
  async revokeSession(id: string, userId: string, reason: SessionRecord['revokeReason'], at: Date) {
    const session = this.sessions.get(id);
    if (!session || session.userId !== userId || session.revokedAt !== null) return false;
    session.revokedAt = at;
    session.revokeReason = reason;
    return true;
  }
  async revokeUserSessions(
    userId: string,
    reason: SessionRecord['revokeReason'],
    at: Date,
    except?: string,
  ) {
    const doomed = [...this.sessions.values()].filter(
      (s) => s.userId === userId && s.revokedAt === null && s.id !== except,
    );
    for (const session of doomed) {
      session.revokedAt = at;
      session.revokeReason = reason;
    }
    return doomed.map((s) => s.id);
  }
  async createRefreshToken(input: NewRefreshToken) {
    const record: RefreshTokenRecord = { ...input, usedAt: null, revokedAt: null };
    this.tokens.set(record.tokenHash, record);
    return record;
  }
  async findRefreshTokenByHash(hash: string) {
    return this.tokens.get(hash) ?? null;
  }
  /** Conditional, like the SQL it stands in for: the second caller loses. */
  async markRefreshTokenUsed(tokenId: string, at: Date) {
    const record = [...this.tokens.values()].find((t) => t.id === tokenId);
    if (!record || record.usedAt !== null) return false;
    record.usedAt = at;
    return true;
  }
  async revokeSessionTokens(sessionId: string, at: Date) {
    let count = 0;
    for (const record of this.tokens.values()) {
      if (record.sessionId === sessionId && record.revokedAt === null) {
        record.revokedAt = at;
        count += 1;
      }
    }
    return count;
  }
}

class FakeChallenges implements ChallengeRepositoryPort {
  otps: OtpChallengeRecord[] = [];
  resets: PasswordResetRecord[] = [];
  attempts: NewLoginAttempt[] = [];

  async createOtpChallenge(input: NewOtpChallenge) {
    const record: OtpChallengeRecord = { ...input, attempts: 0, consumedAt: null };
    this.otps.push(record);
    return record;
  }
  async findLatestOtpChallenge(destination: string, purpose: OtpChallengeRecord['purpose']) {
    return (
      [...this.otps]
        .reverse()
        .find((o) => o.destination === destination && o.purpose === purpose) ?? null
    );
  }
  async recordOtpAttempt(id: string) {
    const record = this.otps.find((o) => o.id === id)!;
    record.attempts += 1;
    return record.attempts;
  }
  async consumeOtpChallenge(id: string, at: Date) {
    const record = this.otps.find((o) => o.id === id)!;
    if (record.consumedAt !== null) return false;
    record.consumedAt = at;
    return true;
  }
  async createPasswordReset(input: NewPasswordReset) {
    const record: PasswordResetRecord = { ...input, consumedAt: null };
    this.resets.push(record);
    return record;
  }
  async findPasswordResetByHash(hash: string) {
    return this.resets.find((r) => r.tokenHash === hash) ?? null;
  }
  async consumePasswordReset(id: string, at: Date) {
    const record = this.resets.find((r) => r.id === id)!;
    if (record.consumedAt !== null) return false;
    record.consumedAt = at;
    return true;
  }
  async invalidatePasswordResets(userId: string, at: Date) {
    let count = 0;
    for (const record of this.resets) {
      if (record.userId === userId && record.consumedAt === null) {
        record.consumedAt = at;
        count += 1;
      }
    }
    return count;
  }
  async recordLoginAttempt(input: NewLoginAttempt) {
    this.attempts.push(input);
  }
}

class FakeAuthCache implements AuthCachePort {
  epochs = new Map<string, number>();
  revoked = new Set<string>();
  rotations = new Map<string, RotationReplay>();

  async readEpoch(userId: string) {
    return this.epochs.get(userId) ?? null;
  }
  async writeEpoch(userId: string, epoch: number) {
    this.epochs.set(userId, epoch);
  }
  async forgetEpoch(userId: string) {
    this.epochs.delete(userId);
  }
  async markSessionRevoked(sessionId: string) {
    this.revoked.add(sessionId);
  }
  async isSessionRevoked(sessionId: string) {
    return this.revoked.has(sessionId);
  }
  async rememberRotation(hash: string, replay: RotationReplay) {
    this.rotations.set(hash, replay);
  }
  async recallRotation(hash: string) {
    return this.rotations.get(hash) ?? null;
  }
}

const fakeAudit = (): AuthAuditPort & { events: string[] } => {
  const events: string[] = [];
  return {
    events,
    async record(event) {
      events.push(event.action);
    },
  };
};

/** No transaction to open; the point is only that repositories enlist through it. */
const fakeUnitOfWork = { runInTransaction: <T>(fn: () => Promise<T>) => fn() };

const fakeLimiter = {
  hits: [] as string[],
  async consume(key: string) {
    this.hits.push(key);
    return { allowed: true, remaining: 99, retryAfterSeconds: 0 };
  },
  async reset() {},
};

const fakePermissions = {
  async resolve(userId: string) {
    return {
      userId,
      status: 'active' as const,
      roles: ['customer'],
      permissions: ['orders:read'],
      vendorIds: [],
      permHash: fingerprint(['orders:read']),
    };
  },
  async invalidate() {},
};

/**
 * `REGION_CATALOG` with an empty catalogue — so `defaultsFor` returns the platform fallbacks,
 * which is precisely what the real `RegionsService` does for a country the table does not know.
 */
const fakeRegions = {
  async activeCountry() {
    return null;
  },
  async activeCurrency() {
    return null;
  },
  async activeLanguage() {
    return null;
  },
  async defaultsFor() {
    return { countryCode: 'BD', currency: 'BDT', locale: 'en', timezone: 'Asia/Dhaka' };
  },
};

const fakeContext = {
  get: () => ({
    requestId: 'harness',
    startedAt: NOW,
    locale: 'en',
    countryCode: 'BD',
    currency: 'BDT',
    timezone: 'Asia/Dhaka',
    ip: '127.0.0.1',
    userAgent: 'harness/1.0',
    store: new Map(),
  }),
  actor: undefined,
  setActor() {},
  run: <T>(_ctx: unknown, fn: () => T) => fn(),
  require() {
    throw new Error('not used');
  },
  requestId: 'harness',
};

async function main(): Promise<void> {
  const config = jwtConfig();
  const clock = new FakeClock(NOW);
  const ids = new IdService(clock);
  const secrets = new NodeSecretGenerator();
  const hasher = new Argon2Hasher(config);
  const signer = new JoseTokenSigner(config, { isProduction: false } as never, clock);
  await signer.onModuleInit();

  // -------------------------------------------------------------------------
  section('Argon2id (D6 §Sign-in methods)');
  const hash = await hasher.hash('demo1234');
  check('produces an argon2id encoding', hash.startsWith('$argon2id$'));
  check(
    'encodes the configured cost parameters',
    hash.includes(`m=${config.argon2.memoryCost},t=${config.argon2.timeCost},p=1`),
  );
  equal('verifies the right password', await hasher.verify(hash, 'demo1234'), true);
  equal('refuses the wrong password', await hasher.verify(hash, 'demo1235'), false);
  equal(
    'refuses the unusable-password sentinel',
    await hasher.verify(UNUSABLE_PASSWORD_HASH, UNUSABLE_PASSWORD_HASH),
    false,
  );
  equal('a corrupt hash is not a match, not a crash', await hasher.verify('$argon2id$junk', 'x'), false);
  equal('no rehash needed at the current cost', hasher.needsRehash(hash), false);
  equal(
    'rehash needed for a weaker hash',
    hasher.needsRehash('$argon2id$v=19$m=4096,t=1,p=1$abc$def'),
    true,
  );
  equal('rehash needed for a bcrypt hash', hasher.needsRehash('$2b$12$abcdef'), true);

  // The property that closes the enumeration oracle: a miss must cost what a hit costs.
  const timeOf = async (fn: () => Promise<unknown>): Promise<number> => {
    const started = process.hrtime.bigint();
    await fn();
    return Number(process.hrtime.bigint() - started) / 1e6;
  };
  const hitMs = await timeOf(() => hasher.verify(hash, 'wrong-but-real-account'));
  const missMs = await timeOf(() => hasher.verifyDummy('wrong-and-no-account'));
  const ratio = Math.max(hitMs, missMs) / Math.min(hitMs, missMs);
  check(
    `a miss costs the same as a hit within 2× (hit ${hitMs.toFixed(0)}ms, miss ${missMs.toFixed(0)}ms)`,
    ratio < 2,
  );

  // -------------------------------------------------------------------------
  section('RS256 access tokens (D6 §Token model)');
  const claims = {
    sub: 'usr_demo',
    sid: 'ses_1',
    role: 'customer' as const,
    permHash: 'abcd1234',
    countryCode: 'BD',
    currency: 'BDT',
    locale: 'bn',
    epoch: 3,
  };
  const signed = await signer.signAccessToken(claims);
  const verified = await signer.verifyAccessToken(signed.token);
  equal('round-trips the subject', verified.sub, 'usr_demo');
  equal('round-trips the session id', verified.sid, 'ses_1');
  equal('round-trips the epoch', verified.epoch, 3);
  equal('round-trips the locale', verified.locale, 'bn');
  equal('carries the key id', verified.keyId, config.keyId);
  equal(
    // Measured against the injected clock, not the wall clock — which is the whole
    // reason `signAccessToken` takes one.
    'expires exactly one access TTL after the injected now',
    (signed.expiresAt.getTime() - clock.now()) / 1000,
    config.accessTtlSeconds,
  );

  /**
   * Expiry is decided by the **injected** clock, both when minting and when verifying.
   *
   * This assertion exists because its absence hid a real defect: `jwtVerify` defaulted to
   * `new Date()`, so a token stamped from `FakeClock` verified only during the fifteen
   * real-world minutes after that fixed instant — and every run outside that window failed
   * with `"exp" claim timestamp check failed`. The fix was `currentDate` on the verify call;
   * this is what stops it coming back, and it is also what makes `clock.advance` a real test
   * of expiry rather than a no-op.
   */
  check('verifies while the injected clock says it is live', (await signer.verifyAccessToken(signed.token)).sub === 'usr_demo');
  clock.advance((config.accessTtlSeconds + 1) * 1000);
  await throws('refuses the same token once the injected clock passes its expiry', () =>
    signer.verifyAccessToken(signed.token),
  );
  clock.set(NOW);
  check('and accepts it again once the clock is back inside the window', (await signer.verifyAccessToken(signed.token)).sub === 'usr_demo');

  const [header, payload, signature] = signed.token.split('.');
  await throws('refuses a tampered payload', () =>
    signer.verifyAccessToken(
      `${header}.${Buffer.from(
        JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), epoch: 99 }),
      ).toString('base64url')}.${signature}`,
    ),
  );
  await throws('refuses a token with no signature', () => signer.verifyAccessToken(`${header}.${payload}.`));
  await throws('refuses gibberish', () => signer.verifyAccessToken('not-a-token'));
  // Algorithm confusion: a token that *claims* HS256 must not be verified with the
  // RSA public key as an HMAC secret.
  const forgedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', kid: config.keyId })).toString(
    'base64url',
  );
  await throws('refuses an alg-confusion forgery (HS256)', () =>
    signer.verifyAccessToken(`${forgedHeader}.${payload}.${signature}`),
  );
  const keys = await signer.publicKeys();
  equal('publishes exactly one JWKS key with no rotation in flight', keys.length, 1);
  equal('the JWKS key is RSA for signing', `${keys[0].kty}/${keys[0].use}/${keys[0].alg}`, 'RSA/sig/RS256');
  check('the JWKS key has no private exponent', !('d' in keys[0]));

  // -------------------------------------------------------------------------
  section('Secrets (node:crypto)');
  const codes = Array.from({ length: 400 }, () => secrets.numericCode(6));
  check('every code is exactly six digits', codes.every((c) => /^\d{6}$/.test(c)));
  check('codes are padded, not shortened', codes.every((c) => c.length === 6));
  check('codes vary', new Set(codes).size > 300);
  equal('sha256 is stable', secrets.sha256('abc'), secrets.sha256('abc'));
  equal('sha256 is 64 hex chars', secrets.sha256('abc').length, 64);
  check('the pepper changes the OTP hash', secrets.hashOtp('123456', 'a') !== secrets.hashOtp('123456', 'b'));
  equal('constant-time compare accepts equal values', secrets.matches('abc', 'abc'), true);
  equal('constant-time compare rejects different values', secrets.matches('abc', 'abd'), false);
  equal('constant-time compare rejects different lengths', secrets.matches('abc', 'abcd'), false);
  check('tokens are url-safe', /^[\w-]+$/.test(secrets.token(32)));

  // -------------------------------------------------------------------------
  section('Refresh rotation and reuse detection (D6 §Rotation)');
  const identity = new FakeIdentity();
  const sessions = new FakeSessions();
  const cache = new FakeAuthCache();
  const audit = fakeAudit();
  const user = identity.seed({ id: 'usr_demo', email: 'demo@foodora.dev' }, hash);

  const tokens = new TokenService(
    identity,
    sessions,
    fakePermissions,
    signer,
    secrets,
    cache,
    audit,
    fakeUnitOfWork,
    clock,
    config,
    ids,
  );

  const first = await tokens.startSession(user, ['orders:read'], 'abcd1234', {
    rememberMe: false,
    ip: '127.0.0.1',
    userAgent: 'harness',
    deviceId: null,
  });
  equal('a session was created', sessions.sessions.size, 1);
  equal('one refresh token exists', sessions.tokens.size, 1);
  check('the refresh token is not stored in the clear', !sessions.tokens.has(first.refreshToken));
  check('its SHA-256 is what is stored', sessions.tokens.has(secrets.sha256(first.refreshToken)));
  equal(
    'without "remember me" the family lives 7 days',
    Math.round((first.refreshTokenExpiresAt.getTime() - NOW) / 86_400_000),
    7,
  );

  const remembered = await tokens.startSession(user, [], '', {
    rememberMe: true,
    ip: null,
    userAgent: null,
    deviceId: null,
  });
  equal(
    'with "remember me" it lives 30 days',
    Math.round((remembered.refreshTokenExpiresAt.getTime() - NOW) / 86_400_000),
    30,
  );

  clock.advance(60_000);
  const rotated = await tokens.rotateRefreshToken(first.refreshToken, '127.0.0.1');
  check('rotation succeeds', rotated.ok);
  const child = rotated.ok ? rotated.data.tokens : null;
  check('a new refresh token is issued', child !== null && child.refreshToken !== first.refreshToken);
  equal('the chain now has two links for this session', countTokens(sessions, first.sessionId), 2);
  check(
    'the child records its parent',
    sessions.tokens.get(secrets.sha256(child!.refreshToken))!.parentId !== null,
  );
  equal(
    'the absolute lifetime does not extend on rotation',
    child!.refreshTokenExpiresAt.getTime(),
    first.refreshTokenExpiresAt.getTime(),
  );
  check('the spent token is marked used', sessions.tokens.get(secrets.sha256(first.refreshToken))!.usedAt !== null);

  // Inside the replay window, presenting the spent token again is a race, not a theft.
  const replayed = await tokens.rotateRefreshToken(first.refreshToken, '127.0.0.1');
  check('a replay inside the window succeeds', replayed.ok);
  equal(
    'and hands back the winner’s refresh token',
    replayed.ok ? replayed.data.tokens.refreshToken : null,
    child!.refreshToken,
  );
  // Deliberately not "a *different* access token": the claims and the second are
  // identical, and a JWT is deterministic, so the two mints are byte-identical. What
  // matters is that the loser is handed a token that verifies for the right session
  // rather than being told its token was stolen.
  const replayedClaims = replayed.ok
    ? await signer.verifyAccessToken(replayed.data.tokens.accessToken)
    : null;
  equal('with a valid access token for the same session', replayedClaims?.sid, first.sessionId);
  equal('the session is still alive', sessions.sessions.get(first.sessionId)!.revokedAt, null);

  // Outside the window, the same presentation is theft.
  cache.rotations.clear();
  const reuse = await tokens.rotateRefreshToken(first.refreshToken, '10.0.0.9');
  equal('reuse outside the window is refused', reuse.ok, false);
  equal('with the reuse key', reuse.ok ? null : reuse.error.key, AuthError.refreshReuse);
  check('the session is revoked', sessions.sessions.get(first.sessionId)!.revokedAt !== null);
  equal(
    'for the right reason',
    sessions.sessions.get(first.sessionId)!.revokeReason,
    'rotation-reuse',
  );
  check('every token in the chain is revoked', allRevoked(sessions, first.sessionId));
  check('the revocation is marked for @FreshSession handlers', cache.revoked.has(first.sessionId));
  check('an audit row was written', audit.events.includes('auth.token.reuse'));
  check(
    'the *other* session is untouched — one leaked chain is not every chain',
    sessions.sessions.get(remembered.sessionId)!.revokedAt === null,
  );

  const afterRevoke = await tokens.rotateRefreshToken(child!.refreshToken, null);
  equal('the revoked child can no longer refresh', afterRevoke.ok, false);
  equal(
    'and says so as an invalid token, not as reuse',
    afterRevoke.ok ? null : afterRevoke.error.key,
    AuthError.refreshInvalid,
  );
  equal('an unknown token is refused', (await tokens.rotateRefreshToken('never-issued', null)).ok, false);

  // An expired family cannot be renewed.
  const expiring = await tokens.startSession(user, [], '', {
    rememberMe: false,
    ip: null,
    userAgent: null,
    deviceId: null,
  });
  clock.advance(8 * 86_400_000);
  equal(
    'an expired refresh token is refused',
    (await tokens.rotateRefreshToken(expiring.refreshToken, null)).ok,
    false,
  );
  clock.set(NOW);

  // -------------------------------------------------------------------------
  section('Sign-in: lockout, enumeration safety, rehash');
  const challenges = new FakeChallenges();
  const authentication = new AuthenticationService(
    identity,
    challenges,
    hasher,
    fakePermissions,
    // E3 put the country table between the request and a new account's region. The fake answers
    // from the platform defaults, which is exactly what `RegionsService.defaultsFor` does for an
    // unknown country — so this harness continues to assert the behaviour it was written for.
    fakeRegions,
    fakeLimiter,
    fakeUnitOfWork,
    clock,
    { defaults: { countryCode: 'BD', currency: 'BDT', locale: 'en', timezone: 'Asia/Dhaka' } } as never,
    tokens,
    fakeContext,
    ids,
  );

  const good = await authentication.login({
    email: 'demo@foodora.dev',
    password: 'demo1234',
    rememberMe: false,
  });
  check('a correct password signs in', good.ok);
  equal('the resolved permissions travel with it', good.ok ? good.data.permissions[0] : null, 'orders:read');
  check('an access token is issued', (good.ok ? good.data.tokens.accessToken : '').length > 100);
  equal('the successful attempt is recorded', challenges.attempts.at(-1)!.success, true);
  equal('lastLoginAt is stamped', identity.users.get('usr_demo')!.lastLoginAt !== null, true);

  const unknown = await authentication.login({
    email: 'nobody@foodora.dev',
    password: 'demo1234',
    rememberMe: false,
  });
  equal('an unknown account is refused', unknown.ok, false);
  equal(
    'with the same key as a wrong password — no enumeration',
    unknown.ok ? null : unknown.error.key,
    AuthError.invalidCredentials,
  );
  equal('and the attempt is still logged', challenges.attempts.at(-1)!.identifier, 'nobody@foodora.dev');
  equal('with no user id attached', challenges.attempts.at(-1)!.userId, null);

  const wrong = await authentication.login({
    email: 'demo@foodora.dev',
    password: 'not-it',
    rememberMe: false,
  });
  equal('a wrong password is refused', wrong.ok, false);
  equal('with the same key', wrong.ok ? null : wrong.error.key, AuthError.invalidCredentials);
  equal('the failure counter moved', identity.credentials.get('usr_demo')!.failedCount, 1);

  // Four more failures reach the first lockout step.
  for (let attempt = 0; attempt < 4; attempt++) {
    await authentication.login({ email: 'demo@foodora.dev', password: 'not-it', rememberMe: false });
  }
  equal('five consecutive failures', identity.credentials.get('usr_demo')!.failedCount, 5);
  check('the account is now locked', identity.credentials.get('usr_demo')!.lockedUntil !== null);

  const locked = await authentication.login({
    email: 'demo@foodora.dev',
    password: 'demo1234',
    rememberMe: false,
  });
  equal('even the correct password is refused while locked', locked.ok, false);
  equal('with the lockout key', locked.ok ? null : locked.error.key, AuthError.accountLocked);
  check(
    'and a countdown the UI can render',
    !locked.ok && typeof locked.error.params?.unlockInSeconds === 'number',
  );

  clock.advance(61_000);
  const unlocked = await authentication.login({
    email: 'demo@foodora.dev',
    password: 'demo1234',
    rememberMe: false,
  });
  check('the lock expires on its own — nothing sweeps it', unlocked.ok);
  equal('and a correct password forgives the counter', identity.credentials.get('usr_demo')!.failedCount, 0);

  // A weak stored hash is upgraded on the way through.
  identity.credentials.get('usr_demo')!.passwordHash = await (async () => {
    const weak = new Argon2Hasher({
      ...config,
      argon2: { memoryCost: 8192, timeCost: 1 },
    });
    return weak.hash('demo1234');
  })();
  const rehashesBefore = identity.rehashes;
  await authentication.login({ email: 'demo@foodora.dev', password: 'demo1234', rememberMe: false });
  equal('a weak hash is upgraded at sign-in', identity.rehashes, rehashesBefore + 1);
  check(
    'and the upgrade did not bump the token epoch',
    identity.credentials.get('usr_demo')!.tokenEpoch === 0,
  );

  const suspended = identity.seed({ id: 'usr_ban', email: 'ban@foodora.dev', status: 'banned' }, hash);
  const banned = await authentication.login({
    email: suspended.email,
    password: 'demo1234',
    rememberMe: false,
  });
  equal('a banned account cannot sign in', banned.ok, false);
  equal('and is told so', banned.ok ? null : banned.error.key, AuthError.accountSuspended);

  const passwordless = identity.seed({ id: 'usr_otp', email: 'otp@foodora.dev' });
  const noPassword = await authentication.login({
    email: passwordless.email,
    password: 'anything',
    rememberMe: false,
  });
  equal('a passwordless account is refused', noPassword.ok, false);
  equal(
    'as invalid credentials, not "this account has no password"',
    noPassword.ok ? null : noPassword.error.key,
    AuthError.invalidCredentials,
  );
  equal(
    'though the real reason is recorded for support',
    challenges.attempts.at(-1)!.reason,
    AuthError.noPassword,
  );

  const taken = await authentication.register({
    name: 'Dup',
    email: 'demo@foodora.dev',
    phone: null,
    password: 'demo1234',
    role: 'customer',
    marketingOptIn: false,
  });
  equal('registering a taken email is refused', taken.ok, false);
  equal('with the Phase C key', taken.ok ? null : taken.error.key, AuthError.emailTaken);
  equal('on the right form field', taken.ok ? null : taken.error.path, 'input.email');

  const fresh = await authentication.register({
    name: 'New Person',
    email: 'new@foodora.dev',
    phone: '+8801712345678',
    password: 'demo1234',
    role: 'restaurant-owner',
    marketingOptIn: true,
  });
  check('a new account is created and signed in', fresh.ok);
  equal('with the requested self-service role', fresh.ok ? fresh.data.user.primaryRole : null, 'restaurant-owner');
  equal('and starts unverified', fresh.ok ? fresh.data.user.status : null, 'pending');
  equal(
    'taking its region from the request, not from a constant',
    fresh.ok ? fresh.data.user.countryCode : null,
    'BD',
  );

  await throws('a privileged role is refused outright', () =>
    authentication.register({
      name: 'Sneaky',
      email: 'sneaky@foodora.dev',
      phone: null,
      password: 'demo1234',
      role: 'super-admin' as never,
      marketingOptIn: false,
    }),
  );

  // -------------------------------------------------------------------------
  section('Lockout ladder (pure)');
  const base = new Date(NOW);
  equal('four failures earn no lock', lockUntil(4, base), null);
  equal('five failures → 1 minute', (lockUntil(5, base)!.getTime() - NOW) / 1000, 60);
  equal('eight failures → 15 minutes', (lockUntil(8, base)!.getTime() - NOW) / 1000, 900);
  equal('twelve failures → 1 hour', (lockUntil(12, base)!.getTime() - NOW) / 1000, 3600);
  equal('and it stays at an hour beyond that', (lockUntil(50, base)!.getTime() - NOW) / 1000, 3600);
  equal('a future lock is a lock', isLocked(new Date(NOW + 1000), base), true);
  equal('a past lock is not', isLocked(new Date(NOW - 1000), base), false);
  equal('no lock is not a lock', isLocked(null, base), false);
  equal('the countdown rounds up', unlockInSeconds(new Date(NOW + 1500), base), 2);

  // -------------------------------------------------------------------------
  section('OTP policy (pure)');
  const challenge: OtpChallengeRecord = {
    id: 'otp_1',
    userId: null,
    purpose: 'login',
    channel: 'sms',
    destination: '+8801712345678',
    codeHash: 'x',
    attempts: 0,
    maxAttempts: 5,
    consumedAt: null,
    expiresAt: new Date(NOW + 300_000),
    createdAt: new Date(NOW),
  };
  equal('a live challenge is usable', inspectChallenge(challenge, base).usable, true);
  equal(
    'a consumed one is not',
    inspectChallenge({ ...challenge, consumedAt: new Date(NOW) }, base).usable,
    false,
  );
  equal(
    'an expired one is not',
    inspectChallenge(challenge, new Date(NOW + 300_001)).usable,
    false,
  );
  const exhausted = inspectChallenge({ ...challenge, attempts: 5 }, base);
  equal('an exhausted one is not', exhausted.usable, false);
  equal('and says why', exhausted.usable ? null : exhausted.reason, 'exhausted');
  equal('a fresh challenge cannot be resent yet', resendAfterSeconds(challenge, base), 60);
  equal(
    'and can be after the cooldown',
    resendAfterSeconds(challenge, new Date(NOW + 60_000)),
    0,
  );
  equal('with no challenge there is nothing to wait for', resendAfterSeconds(null, base), 0);
  equal(
    'phone normalisation collapses formatting',
    normalisePhone('+880 1712-345678'),
    normalisePhone('+8801712345678'),
  );
  equal('and keeps the plus', normalisePhone('+880 1712-345678'), '+8801712345678');
  equal('email normalisation lowercases and trims', normaliseEmail('  A@B.CO '), 'a@b.co');

  // -------------------------------------------------------------------------
  section('Authorization algebra (D6 §RBAC and PBAC)');
  const resolvedBase = {
    userId: 'usr_1',
    status: 'active' as const,
    primaryRole: 'customer' as const,
    now: base,
  };
  const plain = resolveAuthorization({ ...resolvedBase, roleGrants: [], directGrants: [] });
  equal('primaryRole is in the set even with no assignment row', plain.roles.join(), 'customer');
  equal('and grants nothing by itself', plain.permissions.length, 0);

  const withRole = resolveAuthorization({
    ...resolvedBase,
    roleGrants: [
      {
        roleSlug: 'vendor-manager',
        vendorId: 'ven_bella_napoli',
        expiresAt: null,
        permissions: ['orders:accept', 'menu:edit'],
      },
    ],
    directGrants: [],
  });
  equal('role permissions are unioned', withRole.permissions.join(), 'menu:edit,orders:accept');
  equal('the scope is collected', withRole.vendorIds.join(), 'ven_bella_napoli');
  equal('the assigned role joins the primary one', withRole.roles.length, 2);

  const denied = resolveAuthorization({
    ...resolvedBase,
    roleGrants: [
      { roleSlug: 'vendor-manager', vendorId: null, expiresAt: null, permissions: ['orders:accept', 'orders:refund'] },
    ],
    directGrants: [
      { permissionSlug: 'orders:refund', effect: false, vendorId: null, expiresAt: null },
      { permissionSlug: 'reviews:reply', effect: true, vendorId: null, expiresAt: null },
    ],
  });
  equal('a direct denial beats a role grant', denied.permissions.includes('orders:refund'), false);
  equal('a direct grant is added', denied.permissions.includes('reviews:reply'), true);
  equal('the rest survives', denied.permissions.includes('orders:accept'), true);

  const expired = resolveAuthorization({
    ...resolvedBase,
    roleGrants: [
      {
        roleSlug: 'customer-support',
        vendorId: null,
        expiresAt: new Date(NOW - 1),
        permissions: ['orders:read'],
      },
    ],
    directGrants: [],
  });
  equal('an expired assignment grants nothing', expired.permissions.length, 0);
  equal('and its role is not held', expired.roles.includes('customer-support'), false);

  const admin = resolveAuthorization({
    ...resolvedBase,
    primaryRole: 'super-admin',
    roleGrants: [],
    directGrants: [],
  });
  equal('a super-admin holds the wildcard', admin.permissions.join(), PERMISSION_WILDCARD);
  equal('which satisfies anything', grantsAll(admin.permissions, ['payouts:approve', 'cms:publish']), true);
  equal('an empty requirement is always satisfied', grantsAll([], []), true);
  equal('all, not any', grantsAll(['a'], ['a', 'b']), false);
  equal('all means all', grantsAll(['a', 'b'], ['a', 'b']), true);

  equal(
    'the fingerprint ignores ordering',
    fingerprint(['b:read', 'a:write']),
    fingerprint(['a:write', 'b:read']),
  );
  check('and separates on boundaries', fingerprint(['ab', 'c']) !== fingerprint(['a', 'bc']));

  // -------------------------------------------------------------------------
  section('Enum codec (schema ↔ wire)');
  const roles = enumCodec('UserRoleSlug');
  equal('maps a Prisma value to the wire', roles.toWire('RESTAURANT_OWNER'), 'restaurant-owner');
  equal('and back', roles.toDb('restaurant-owner'), 'RESTAURANT_OWNER');
  equal('covers all fourteen roles', roles.wireValues.length, USER_ROLES.length);
  check('every wire value round-trips', USER_ROLES.every((r) => roles.toWire(roles.toDb(r)) === r));
  try {
    roles.toDb('not-a-role');
    check('an unknown value throws', false);
  } catch {
    check('an unknown value throws', true);
  }
  try {
    assertVocabularyMatches('OtpChannel', OTP_CHANNELS);
    check('a matching vocabulary passes the boot check', true);
  } catch {
    check('a matching vocabulary passes the boot check', false);
  }
  try {
    assertVocabularyMatches('OtpChannel', ['sms']);
    check('drift fails the boot check', false);
  } catch {
    check('drift fails the boot check', true);
  }

  // -------------------------------------------------------------------------
  section('Refresh cookie (D6 §Cookies and CSRF)');
  const written: string[][] = [];
  const reply = { header: (_name: string, value: string[]) => written.push(value) };
  const options = cookieOptionsFrom(config, false);
  setAuthCookies(
    reply as never,
    'the-refresh-token',
    'the-csrf-token',
    new Date(Date.now() + 604_800_000),
    options,
  );
  const [rt, csrf] = written[0];
  check('the refresh cookie is HttpOnly', rt.includes('HttpOnly'));
  check('and scoped to /auth, so it never reaches /graphql', rt.includes('Path=/auth'));
  check('and SameSite=Lax so an email link works', rt.includes('SameSite=Lax'));
  check('the CSRF cookie is readable by JavaScript', !csrf.includes('HttpOnly'));
  // Path=/ or `document.cookie` on a page at /login cannot see it, and the client
  // can never send the header the endpoint requires (V1 Unit 0).
  check('and served at / so the page can actually read it', csrf.includes('Path=/;'));
  check('both are set in one header value', written[0].length === 2);
  check('no Domain on localhost', !rt.includes('Domain='));
  clearAuthCookies(reply as never, options);
  check('clearing uses Max-Age=0 on the same path', written[1][0].includes('Max-Age=0'));
  check(
    'and clears the CSRF cookie on its own path, or it survives sign-out',
    written[1][1].includes('Path=/;') && written[1][1].includes('Max-Age=0'),
  );
  equal(
    'a cookie is read back by name',
    readCookie({ headers: { cookie: 'a=1; rt=abc%3Dd; csrf=z' } } as never, 'rt'),
    'abc=d',
  );
  equal(
    'a missing cookie is undefined',
    readCookie({ headers: { cookie: 'a=1' } } as never, 'rt'),
    undefined,
  );

  // -------------------------------------------------------------------------
  console.log(
    `\n${failures.length === 0 ? '✓' : '✗'} ${passed} assertions passed, ${failures.length} failed.`,
  );
  if (failures.length > 0) process.exit(1);
}

function countTokens(sessions: FakeSessions, sessionId: string): number {
  return [...sessions.tokens.values()].filter((t) => t.sessionId === sessionId).length;
}

function allRevoked(sessions: FakeSessions, sessionId: string): boolean {
  return [...sessions.tokens.values()]
    .filter((t) => t.sessionId === sessionId)
    .every((t) => t.revokedAt !== null);
}

void main();
