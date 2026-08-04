import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { HandoffCodePort } from '../domain';

/**
 * The hand-off code, from `node:crypto`.
 *
 * `randomInt` rather than `Math.random()`: the code is the only thing standing between a
 * courier and marking an order delivered without handing it over, and a predictable
 * sequence would make it decorative. It is also uniform — the modulo bias that
 * `Math.floor(Math.random() * n)` avoids by luck, `randomInt` avoids by construction.
 *
 * Zero-padded, so `"0482"` and not `"482"`. A four-digit field that sometimes contains
 * three digits is a comparison bug waiting for the customer who was issued a code under
 * 1000 — one in ten of them.
 */
@Injectable()
export class NodeHandoffCode implements HandoffCodePort {
  issue(digits: number): string {
    const ceiling = 10 ** digits;
    return randomInt(0, ceiling).toString().padStart(digits, '0');
  }

  hash(code: string): string {
    return createHash('sha256').update(code, 'utf8').digest('hex');
  }

  /**
   * Constant-time, and length-checked first because `timingSafeEqual` throws on a length
   * mismatch rather than returning false.
   *
   * The timing channel on a four-digit code is not the real defence — a rate limit is —
   * but comparing secrets in constant time is the kind of habit that should not have
   * exceptions, because the exceptions are what get copied.
   */
  matches(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }
}
