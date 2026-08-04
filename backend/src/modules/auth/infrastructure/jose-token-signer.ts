import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  type JWTPayload,
  jwtVerify,
  SignJWT,
} from 'jose';

import { UnauthenticatedError } from '../../../common/errors';
import { appConfig, type AppConfig, jwtConfig, type JwtConfig } from '../../../config';
import type { AccessTokenClaims } from '../../../shared/contracts';
import type { UserRole } from '../../../shared/enums';
import { CLOCK, type Clock } from '../../../shared/kernel';
import type { JsonWebKey, TokenSignerPort } from '../domain';

/** The claim names on the wire — short, and exactly the set D6 §Token model lists. */
interface AccessClaims extends JWTPayload {
  sid: string;
  role: UserRole;
  permHash: string;
  country: string;
  currency: string;
  locale: string;
  epoch: number;
}

type PublicKey = Awaited<ReturnType<typeof importSPKI>>;
type PrivateKey = Awaited<ReturnType<typeof importPKCS8>>;

/**
 * RS256 access tokens, and the JWKS behind them.
 *
 * **Asymmetric, not HMAC.** A shared secret means every service that needs to
 * *verify* a token can also *mint* one, and the moment a second service exists
 * that is a privilege boundary that does not hold. With RS256 the private key stays
 * here and `/.well-known/jwks.json` is enough for anyone else — which is also why
 * rotation is expressed as a `kid` and an outgoing key rather than as a flag day.
 *
 * `jose` rather than `jsonwebtoken`: it is pure JS over WebCrypto (no native build),
 * it refuses `alg: none` and algorithm confusion by construction, and it exports
 * JWKs, which is otherwise a hand-rolled ASN.1 exercise.
 *
 * Pinned to `jose@5`, and the reason is worth recording: **v6 is ESM-only**, and this
 * application compiles to CommonJS (`tsconfig.json`), so `require('jose')` fails at
 * runtime with `ERR_REQUIRE_ESM` — a failure that does not appear in `tsc`, in
 * `eslint`, or under `bun run`, only in the compiled `node dist/main.js`. The
 * alternatives were a `new Function('return import("jose")')` escape hatch to stop
 * TypeScript downlevelling the dynamic import, or moving the whole app to ESM for one
 * dependency. v5 is dual-build, current, and has the identical API for everything used
 * here.
 */
@Injectable()
export class JoseTokenSigner implements TokenSignerPort, OnModuleInit {
  private readonly logger = new Logger(JoseTokenSigner.name);

  private privateKey!: PrivateKey;
  private publicKey!: PublicKey;
  private previousPublicKey: PublicKey | null = null;

  constructor(
    @Inject(jwtConfig.KEY) private readonly config: JwtConfig,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
    // `iat` and `exp` are timestamps, and nothing on this platform reads the wall
    // clock directly — a token's lifetime is only assertable if "now" is a
    // dependency (README §Conventions).
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Keys are loaded once, at boot — not per request. A PEM import is milliseconds
   * of ASN.1 parsing, and doing it 300 times a second would be a self-inflicted
   * bottleneck on the hottest path in the API.
   */
  async onModuleInit(): Promise<void> {
    if (this.config.privateKey && this.config.publicKey) {
      this.privateKey = await importPKCS8(normalisePem(this.config.privateKey), 'RS256');
      this.publicKey = await importSPKI(normalisePem(this.config.publicKey), 'RS256');
    } else {
      /**
       * No keys configured. In production this is unreachable —
       * `validateEnvironment` refuses to boot without them — so this branch exists
       * for the developer who has just cloned the repository, and it generates an
       * **ephemeral** pair.
       *
       * The consequence is stated plainly rather than hidden: restarting the process
       * invalidates every token it ever signed. That is the correct trade for local
       * work and would be a catastrophe in production, which is why the environment
       * validator, not this comment, is what prevents it.
       */
      const generated = await generateKeyPair('RS256', {
        modulusLength: 2048,
        extractable: true,
      });
      this.privateKey = generated.privateKey;
      this.publicKey = generated.publicKey;
      this.logger.warn(
        'JWT_PRIVATE_KEY / JWT_PUBLIC_KEY are not set — generated an ephemeral RS256 key pair. ' +
          'Every access token becomes invalid when this process restarts. ' +
          'Generate a real pair with: openssl genrsa -out jwt.key 2048 && openssl rsa -in jwt.key -pubout -out jwt.pub',
      );
    }

    if (this.config.previousPublicKey && this.config.previousKeyId) {
      this.previousPublicKey = await importSPKI(
        normalisePem(this.config.previousPublicKey),
        'RS256',
      );
      this.logger.log(
        `Key rotation in progress: honouring "${this.config.previousKeyId}" alongside "${this.config.keyId}".`,
      );
    }
  }

  async signAccessToken(
    claims: Omit<AccessTokenClaims, 'expiresAt' | 'issuedAt' | 'keyId'>,
  ): Promise<{ token: string; expiresAt: Date }> {
    const payload: AccessClaims = {
      sid: claims.sid,
      role: claims.role,
      permHash: claims.permHash,
      country: claims.countryCode,
      currency: claims.currency,
      locale: claims.locale,
      epoch: claims.epoch,
    };

    const issuedAt = Math.floor(this.clock.now() / 1_000);
    const expiresAtSeconds = issuedAt + this.config.accessTtlSeconds;

    const token = await new SignJWT(payload)
      // `typ: at+jwt` (RFC 9068) says out loud that this is an access token, so a
      // verifier cannot be talked into accepting an ID token in its place.
      .setProtectedHeader({ alg: 'RS256', kid: this.config.keyId, typ: 'at+jwt' })
      .setSubject(claims.sub)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAtSeconds)
      .sign(this.privateKey);

    return { token, expiresAt: new Date(expiresAtSeconds * 1_000) };
  }

  async verifyAccessToken(raw: string): Promise<AccessTokenClaims> {
    let keyId: string | undefined;
    try {
      keyId = decodeProtectedHeader(raw).kid;
    } catch {
      // Not even a JWS. Nothing more to learn from it.
      throw new UnauthenticatedError();
    }

    const key =
      keyId && keyId === this.config.previousKeyId && this.previousPublicKey
        ? this.previousPublicKey
        : this.publicKey;

    try {
      const { payload, protectedHeader } = await jwtVerify<AccessClaims>(raw, key, {
        // Pinned, not read from the token: leaving the algorithm to the header is
        // the classic confusion attack, and `jose` only refuses it if told what to
        // expect.
        algorithms: ['RS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        /**
         * The **injected** clock, not `jose`'s default of `new Date()`.
         *
         * `signAccessToken` already stamps `iat` and `exp` from `CLOCK`, so verifying
         * against the system clock means signing and verification can disagree about what
         * time it is. That is not hypothetical: it made E2's harness pass only during the
         * fifteen real-world minutes after its fixed `FakeClock` instant, and it would do
         * the same to any future skew-corrected or test clock. A token's lifetime has to be
         * measured by whatever clock minted it.
         */
        currentDate: this.clock.date(),
      });

      if (!payload.sub || !payload.sid || payload.epoch === undefined) {
        throw new UnauthenticatedError();
      }

      return {
        sub: payload.sub,
        sid: payload.sid,
        role: payload.role,
        permHash: payload.permHash,
        countryCode: payload.country,
        currency: payload.currency,
        locale: payload.locale,
        epoch: payload.epoch,
        keyId: protectedHeader.kid,
        expiresAt: new Date((payload.exp ?? 0) * 1_000),
        issuedAt: new Date((payload.iat ?? 0) * 1_000),
      };
    } catch (error) {
      // Expired, wrong signature, wrong audience, tampered — all one answer to the
      // client, because distinguishing them tells an attacker which part to fix.
      // The detail is logged, not returned.
      if (!this.app.isProduction) {
        this.logger.debug(
          `access token rejected: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw new UnauthenticatedError();
    }
  }

  async publicKeys(): Promise<JsonWebKey[]> {
    const keys: JsonWebKey[] = [await this.toJwk(this.publicKey, this.config.keyId)];
    if (this.previousPublicKey && this.config.previousKeyId) {
      keys.push(await this.toJwk(this.previousPublicKey, this.config.previousKeyId));
    }
    return keys;
  }

  private async toJwk(key: PublicKey, keyId: string): Promise<JsonWebKey> {
    const jwk = await exportJWK(key);
    return { ...jwk, kty: jwk.kty ?? 'RSA', kid: keyId, use: 'sig', alg: 'RS256' };
  }
}

/**
 * Environment variables cannot hold real newlines, so a PEM arrives with `\n`
 * written out. Every deployment hits this exactly once, on the first boot after
 * setting the key, and the error it produces ("Invalid keyData") says nothing about
 * the cause.
 */
function normalisePem(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}
