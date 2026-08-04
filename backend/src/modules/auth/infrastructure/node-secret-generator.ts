import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { SecretGeneratorPort } from '../domain';

/**
 * The random and the one-way, from `node:crypto`.
 *
 * A port with one obvious implementation, for one reason: it lets a test drive the
 * OTP flow with a known code instead of scraping one out of a log line.
 */
@Injectable()
export class NodeSecretGenerator implements SecretGeneratorPort {
  /**
   * `randomBytes`, not `Math.random`. Base64url so the value survives a cookie, a
   * URL and a JSON body without escaping.
   */
  token(bytes: number): string {
    return randomBytes(bytes).toString('base64url');
  }

  /**
   * `randomInt` rather than `randomBytes(…) % 10 ** digits`.
   *
   * The modulo version is biased — 256 does not divide evenly into ten, so some
   * digits come up more often, and a biased six-digit code has less entropy than it
   * looks like it has. `randomInt` rejects and redraws instead.
   *
   * Padded, so `48213` is `"048213"`: an unpadded code is a five-digit code one time
   * in ten.
   */
  numericCode(digits: number): string {
    const ceiling = 10 ** digits;
    return String(randomInt(0, ceiling)).padStart(digits, '0');
  }

  sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  /**
   * SHA-256 over the code and a server-side pepper — **not** Argon2.
   *
   * Argon2 would be wrong here in both directions. A six-digit code has 20 bits of
   * entropy, so no work factor makes the space unguessable once the hash is
   * exposed; what actually protects it is the pepper (which is not in the database)
   * plus five attempts and five minutes. And codes are verified on a path a user is
   * waiting on, where 250 ms per attempt buys nothing.
   */
  hashOtp(code: string, pepper: string): string {
    return this.sha256(`${code}:${pepper}`);
  }

  /**
   * Constant-time comparison. `===` on two hex digests leaks how many leading
   * characters matched through timing, which over enough attempts is a way to
   * reconstruct one.
   */
  matches(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    // `timingSafeEqual` throws on a length mismatch, and the length of a digest is
    // not a secret, so this early return leaks nothing.
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }
}
