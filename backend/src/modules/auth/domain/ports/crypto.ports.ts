import type { AccessTokenClaims } from '../../../../shared/contracts';

/**
 * The cryptographic primitives, as ports.
 *
 * Not because anyone expects to swap Argon2 for something else, but because a
 * unit test of the lockout policy should not spend 250 ms per attempt hashing a
 * password, and because `domain/` may not import `jose` or a native module and
 * still be `domain/`.
 */

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasherPort {
  hash(plaintext: string): Promise<string>;

  /** Constant-time by construction — Argon2 compares the derived key, not the string. */
  verify(hash: string, plaintext: string): Promise<boolean>;

  /**
   * Burns the same amount of time as a real verification, for accounts that do
   * not exist.
   *
   * Without it, "no such user" answers in 2 ms and "wrong password" in 250 ms,
   * and the difference is a free account-enumeration oracle that no amount of
   * identical error messages can hide (D6 §Sign-in methods).
   */
  verifyDummy(plaintext: string): Promise<void>;

  /**
   * True when the stored hash was produced with weaker parameters than the ones
   * now configured — the moment to transparently re-hash, since this is the only
   * time the plaintext is in hand.
   */
  needsRehash(hash: string): boolean;
}

export const TOKEN_SIGNER = Symbol('TOKEN_SIGNER');

export interface JsonWebKey {
  kty: string;
  n?: string;
  e?: string;
  kid: string;
  use: string;
  alg: string;
}

export interface TokenSignerPort {
  /** Signs with the current key; `exp` comes from the configured access TTL. */
  signAccessToken(claims: Omit<AccessTokenClaims, 'expiresAt' | 'issuedAt' | 'keyId'>): Promise<{
    token: string;
    expiresAt: Date;
  }>;

  /** Throws `UnauthenticatedError` on anything that is not currently valid. */
  verifyAccessToken(raw: string): Promise<AccessTokenClaims>;

  /**
   * The public keys, for `/.well-known/jwks.json`. Both the current and the
   * outgoing key while a rotation is in flight, so a token minted five minutes
   * before the deploy still verifies.
   */
  publicKeys(): Promise<JsonWebKey[]>;
}

export const SECRET_GENERATOR = Symbol('SECRET_GENERATOR');

export interface SecretGeneratorPort {
  /** URL-safe random string from `bytes` of CSPRNG output. Refresh and reset tokens. */
  token(bytes: number): string;

  /** A zero-padded numeric code — `"048213"`, never `"48213"`. */
  numericCode(digits: number): string;

  /** SHA-256, hex. What is stored in place of a refresh or reset token. */
  sha256(value: string): string;

  /**
   * SHA-256 over `code + pepper`. The pepper is server-side only, so a stolen
   * `otp_challenges` table is not a list of live codes — a six-digit space is
   * exhaustible in microseconds without one.
   */
  hashOtp(code: string, pepper: string): string;

  /** Constant-time comparison, for anything derived from a secret. */
  matches(a: string, b: string): boolean;
}
