import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../shared/kernel';

/**
 * Crockford base32 — no I, L, O or U, so an id read aloud or typed from a
 * screenshot cannot be mistaken for another one.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;
const RANDOM_BITS = 80n;
const MAX_RANDOM = (1n << RANDOM_BITS) - 1n;

/**
 * Every id the platform mints, with the entity it belongs to.
 *
 * These prefixes are **not cosmetic**. Phase C seeded them (`ven_bella_napoli`,
 * `usr_customer`, `off_welcome`) and the prototype's deep links, screenshots and
 * bookmarks contain them, so the seeds in E12 reuse the same values verbatim and
 * every one of those links still resolves after the cutover
 * (`database/prisma/schema/main.prisma` §1).
 */
export const ID_PREFIXES = {
  user: 'usr',
  session: 'ses',
  device: 'dev',
  /** E2. Only the SHA-256 of a refresh token is stored; this ids the chain link. */
  refreshToken: 'rft',
  otpChallenge: 'otp',
  passwordReset: 'prt',
  loginAttempt: 'att',
  socialIdentity: 'sid',
  role: 'role',
  permission: 'perm',
  roleAssignment: 'ura',
  userPermission: 'upm',
  address: 'addr',
  /** E3. `Country`, `Language` and `Currency` are keyed by their ISO code instead. */
  setting: 'set',
  /** A dated, scoped tax rule. V1 Unit 3 seeds one per market. */
  taxRule: 'tax',
  exchangeRate: 'fx',
  translation: 'tr',
  vendor: 'ven',
  branch: 'brn',
  cuisine: 'cus',
  category: 'cat',
  menuSection: 'sec',
  food: 'fd',
  /**
   * A cart. Its *items* are not minted here — a `CartItem.id` is the composite line id
   * (food id + sorted option ids), because two identical configurations have to collide
   * so they merge instead of stacking. See `cart/domain/policies/line-id.ts`.
   */
  cart: 'crt',
  order: 'ord',
  orderItem: 'oli',
  /**
   * A chosen option on an order line.
   *
   * `cart_item_options` has no id of its own — it is keyed `@@id([cartItemId, optionId])`,
   * because a basket line cannot hold the same add-on twice. `order_item_options` *does*,
   * and the asymmetry is the schema being careful: an order is an immutable financial
   * document, and every row on one wants a stable handle for a refund, a dispute or a line
   * on an invoice to point at.
   */
  orderItemOption: 'oio',
  orderEvent: 'oev',
  payment: 'pay',
  refund: 'rfd',
  ledgerEntry: 'led',
  wallet: 'wal',
  walletTransaction: 'wtx',
  offer: 'off',
  coupon: 'cpn',
  couponClaim: 'clm',
  review: 'rev',
  reservation: 'res',
  bookingPolicy: 'bpol',
  table: 'tbl',
  qrConfig: 'qrc',
  dineInSession: 'dis',
  posSale: 'pos',
  rider: 'rid',
  deliveryJob: 'job',
  deliveryZone: 'dzn',
  mealPlan: 'mpl',
  planTier: 'ptr',
  planMenuItem: 'pml',
  subscription: 'sub',
  cateringService: 'cts',
  cateringPackage: 'cpk',
  cateringAddOn: 'cao',
  cateringQuote: 'qt',
  cmsDocument: 'doc',
  blogPost: 'post',
  testimonial: 'tst',
  notification: 'ntf',
  outboxEvent: 'obx',
  auditLog: 'aud',
  fileAsset: 'fil',
} as const;

export type IdEntity = keyof typeof ID_PREFIXES;
export type IdPrefix = (typeof ID_PREFIXES)[IdEntity];

function encode(value: bigint, length: number): string {
  let out = '';
  let remaining = value;
  for (let i = 0; i < length; i++) {
    out = ALPHABET[Number(remaining & 31n)] + out;
    remaining >>= 5n;
  }
  return out;
}

/**
 * Prefixed, lexicographically sortable ids (ULID body).
 *
 * Postgres has no `@default` that can produce a prefix, so every `create`
 * passes one of these. The upside is worth the keystroke: the prefix makes a
 * log line self-describing and a mis-wired FK obvious, and because the first
 * ten characters are the millisecond timestamp, `ORDER BY id` is chronological
 * — which is what makes the keyset cursors in D5 §Pagination an index-only
 * scan rather than a sort.
 */
@Injectable()
export class IdService {
  private lastMillis = -1;
  private lastRandom = 0n;

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  next<E extends IdEntity>(entity: E): string {
    return `${ID_PREFIXES[entity]}_${this.ulid()}`;
  }

  /** For prefixes owned by a module rather than the registry above. */
  nextWithPrefix(prefix: string): string {
    return `${prefix}_${this.ulid()}`;
  }

  /**
   * Monotonic within a millisecond: two ids minted in the same tick still sort
   * in creation order, so a burst of order events cannot interleave.
   */
  ulid(): string {
    const millis = this.clock.now();

    if (millis === this.lastMillis) {
      this.lastRandom = (this.lastRandom + 1n) & MAX_RANDOM;
      // Overflowing 80 bits inside one millisecond is not reachable in
      // practice; borrowing a millisecond keeps ordering total if it ever is.
      if (this.lastRandom === 0n) this.lastMillis += 1;
    } else {
      this.lastMillis = millis;
      this.lastRandom = BigInt(`0x${randomBytes(10).toString('hex')}`) & MAX_RANDOM;
    }

    return encode(BigInt(this.lastMillis), TIME_CHARS) + encode(this.lastRandom, RANDOM_CHARS);
  }

  /** Cheap shape check — not a database lookup, and not authorization. */
  static matches(id: string, entity: IdEntity): boolean {
    return id.startsWith(`${ID_PREFIXES[entity]}_`);
  }

  /**
   * The mint time encoded in the id. `null` for the Phase C seed ids, which are
   * human-readable (`ven_bella_napoli`) rather than ULIDs — deliberately, so
   * they stay recognisable in the database.
   */
  static mintedAt(id: string): Date | null {
    const body = id.slice(id.indexOf('_') + 1);
    if (body.length !== TIME_CHARS + RANDOM_CHARS) return null;
    let millis = 0n;
    for (const char of body.slice(0, TIME_CHARS)) {
      const index = ALPHABET.indexOf(char);
      if (index < 0) return null;
      millis = millis * 32n + BigInt(index);
    }
    return new Date(Number(millis));
  }
}
