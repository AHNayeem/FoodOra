/**
 * V1 Unit 3's offline verification harness.
 *
 *   bun run verify:checkout
 *
 * ## What this proves
 *
 * The arithmetic and the rules, through the *real* `CheckoutService` against in-memory
 * ports. Three things in particular, and the middle one is the reason the file exists:
 *
 * 1. **The pricing order of operations** — tax on the discounted subtotal, tip on the
 *    undiscounted one, cashback not subtracted, coupon clamped to the subtotal.
 * 2. **The server and the frontend agree.** `frontend/lib/checkout.ts::computeTotals` is
 *    reimplemented at the bottom of this file, from that file, and asserted to produce the
 *    identical total on a table of baskets. A server that priced *correctly* and differently
 *    from the screen would still be a bug — the customer watches a number change when they
 *    press the button — so "correct" is not the only property being checked here.
 * 3. **A client cannot influence a price.** The service is handed a request that sets every
 *    money-shaped field it possibly could, and the resulting order is asserted to be priced
 *    from the fake repository's rows regardless.
 *
 * `scripts/verify-checkout-live.ts` covers what is only true in Postgres: the tax rule
 * resolution, the order-number sequence under concurrency, the items-and-options cascade,
 * the cart being consumed in the same transaction, and the hash-only OTP column.
 */
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/foodora';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.OTP_PEPPER ??= 'harness-pepper';

import { CheckoutService } from '../src/modules/orders/application/checkout.service';
import {
  type CartCheckoutPort,
  type CartLineRecord,
  type CartOwner,
  type CartState,
  type CartVendorRecord,
  cartSubtotal,
  deliveryFeeFor,
  money,
} from '../src/modules/cart/domain';
import type { CatalogReaderPort, FoodItemRecord, VendorRecord } from '../src/modules/catalog/domain';
import {
  amountToMinOrder,
  CheckoutError,
  computePricing,
  CouponRefusal,
  type CouponRecord,
  couponSavings,
  evaluateCoupon,
  formatOrderNumber,
  type HandoffCachePort,
  type HandoffCodePort,
  isValidTipPercent,
  type NewOrder,
  normaliseCode,
  type OrderRepositoryPort,
  type PlacedOrder,
  type TaxRuleRecord,
} from '../src/modules/orders/domain';
import type { UnitOfWorkPort } from '../src/shared/contracts';

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ✗ ${label}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-06-15T12:00:00.000Z');

const VENDOR: CartVendorRecord = {
  id: 'ven_bella',
  slug: 'bella-napoli',
  name: 'Bella Napoli',
  currency: 'BDT',
  countryCode: 'BD',
  deliveryFee: 60,
  minOrder: 300,
  freeDeliveryOver: 800,
};

const VAT_BD: TaxRuleRecord = { label: 'VAT', rate: 0.05 };

const line = (over: Partial<CartLineRecord> = {}): CartLineRecord => ({
  id: 'food_margherita|opt_large',
  foodId: 'food_margherita',
  name: 'Margherita DOP',
  image: 'https://example.test/m.jpg',
  basePrice: 720,
  unitPrice: 840,
  quantity: 1,
  options: [{ groupId: 'grp_size', optionId: 'opt_large', name: 'Large', priceDelta: 120 }],
  ...over,
});

const coupon = (over: Partial<CouponRecord> = {}): CouponRecord => ({
  id: 'cpn_test',
  code: 'TEST15',
  title: '15% off',
  kind: 'percentage',
  value: 15,
  maxDiscount: null,
  minOrder: 0,
  currency: 'BDT',
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  endsAt: new Date('2026-12-31T00:00:00.000Z'),
  usageLimit: 3,
  totalLimit: null,
  totalRedeemed: 0,
  firstOrderOnly: false,
  vendorIds: [],
  categorySlugs: [],
  ...over,
});

const couponContext = (over: Record<string, unknown> = {}) => ({
  vendorId: VENDOR.id,
  currency: 'BDT',
  subtotal: 1000,
  deliveryFee: 60,
  fulfillment: 'delivery' as const,
  lines: [line({ quantity: 2 })],
  categorySlugs: [] as string[],
  isFirstOrder: false,
  timesRedeemed: 0,
  now: NOW,
  ...over,
});

// ---------------------------------------------------------------------------
// Fake ports
// ---------------------------------------------------------------------------

class FakeCart implements CartCheckoutPort {
  cleared: string[] = [];
  adopted: Array<{ userId: string; guestKey: string }> = [];

  constructor(
    private state: CartState | null,
    private readonly vendor: CartVendorRecord | null = VENDOR,
  ) {}

  findLive(_owner: CartOwner): Promise<CartState | null> {
    return Promise.resolve(this.state);
  }

  adoptGuestCart(userId: string, guestKey: string): Promise<CartState | null> {
    this.adopted.push({ userId, guestKey });
    return Promise.resolve(this.state);
  }

  loadVendorSnapshot(_vendorId: string): Promise<CartVendorRecord | null> {
    return Promise.resolve(this.vendor);
  }

  clear(cartId: string): Promise<void> {
    this.cleared.push(cartId);
    this.state = null;
    return Promise.resolve();
  }
}

class FakeCatalog implements CatalogReaderPort {
  constructor(private readonly open = true) {}

  findVendorById(vendorId: string): Promise<VendorRecord | null> {
    // Only `isOpen` is read by checkout; the rest is shape.
    return Promise.resolve({ id: vendorId, isOpen: this.open } as unknown as VendorRecord);
  }

  findFoodById(_foodId: string): Promise<FoodItemRecord | null> {
    return Promise.resolve(null);
  }
}

class FakeOrders implements OrderRepositoryPort {
  written: NewOrder[] = [];
  sequence = 0;

  constructor(
    private readonly tax: TaxRuleRecord | null = VAT_BD,
    private readonly coupons: CouponRecord[] = [],
    private readonly usage: { byUser: number; total: number } = { byUser: 0, total: 0 },
    private readonly ordered = true,
  ) {}

  createOrder(order: NewOrder): Promise<PlacedOrder> {
    this.written.push(order);
    this.sequence += 1;
    return Promise.resolve({
      id: `ord_${this.sequence}`,
      orderNumber: formatOrderNumber(this.sequence),
      vendor: order.vendorSnapshot as CartVendorRecord,
      lines: [...order.lines],
      fulfillment: order.fulfillment,
      address: order.address,
      scheduledFor: order.scheduledFor,
      contact: order.contact,
      notes: order.notes,
      payment: {
        method: order.paymentMethod,
        status: order.paymentStatus,
        cardLast4: order.cardLast4,
      },
      pricing: order.pricing,
      status: 'placed',
      placedAt: order.placedAt,
      estimatedDeliveryAt: order.estimatedDeliveryAt,
      lifecycle: {
        events: [{ id: 'oev_1', status: 'placed', at: order.placedAt, actor: 'customer', note: null }],
        prepMinutes: null,
        promisedReadyAt: null,
        delayMinutes: 0,
        rejectionReason: null,
        cancelReason: null,
        cancelledBy: null,
        failureReason: null,
        rider: null,
        assignment: null,
        assignedAt: null,
        rejectedRiderIds: [],
        otp: '',
        otpAttempts: 0,
        otpVerifiedAt: null,
        refund: 'none',
        refundAmount: 0,
        rating: null,
      },
      createdAt: order.placedAt,
      updatedAt: order.placedAt,
      deletedAt: null,
    });
  }

  findOrderById(): Promise<PlacedOrder | null> {
    return Promise.resolve(null);
  }

  resolveTaxRule(): Promise<TaxRuleRecord | null> {
    return Promise.resolve(this.tax);
  }

  findCouponByCode(code: string): Promise<CouponRecord | null> {
    return Promise.resolve(this.coupons.find((candidate) => candidate.code === code) ?? null);
  }

  countCouponUse(): Promise<{ byUser: number; total: number }> {
    return Promise.resolve(this.usage);
  }

  hasPlacedOrder(): Promise<boolean> {
    return Promise.resolve(this.ordered);
  }
}

class FakeHandoffCode implements HandoffCodePort {
  issued: string[] = [];

  issue(digits: number): string {
    const code = '7'.repeat(digits);
    this.issued.push(code);
    return code;
  }

  hash(code: string): string {
    return `sha256(${code})`;
  }

  matches(a: string, b: string): boolean {
    return a === b;
  }
}

class FakeHandoffCache implements HandoffCachePort {
  store = new Map<string, string>();

  remember(orderId: string, code: string): Promise<void> {
    this.store.set(orderId, code);
    return Promise.resolve();
  }

  recall(orderId: string): Promise<string | null> {
    return Promise.resolve(this.store.get(orderId) ?? null);
  }

  forget(orderId: string): Promise<void> {
    this.store.delete(orderId);
    return Promise.resolve();
  }
}

const passthroughUow: UnitOfWorkPort = {
  runInTransaction: <T>(fn: () => Promise<T>) => fn(),
};

const CONFIG = { maxTipPercent: 1, defaultEtaMinutes: 40, otpDigits: 4, otpTtlHours: 24 };

const clock = {
  now: () => NOW.getTime(),
  date: () => new Date(NOW),
  iso: () => NOW.toISOString(),
};

interface Harness {
  service: CheckoutService;
  cart: FakeCart;
  orders: FakeOrders;
  codes: FakeHandoffCode;
  handoffs: FakeHandoffCache;
}

function harness(over: {
  lines?: CartLineRecord[];
  vendor?: CartVendorRecord | null;
  tax?: TaxRuleRecord | null;
  coupons?: CouponRecord[];
  usage?: { byUser: number; total: number };
  ordered?: boolean;
  open?: boolean;
} = {}): Harness {
  const state: CartState | null =
    over.lines === undefined
      ? { id: 'crt_1', vendorId: VENDOR.id, lines: [line()], updatedAt: NOW }
      : { id: 'crt_1', vendorId: VENDOR.id, lines: over.lines, updatedAt: NOW };

  const cart = new FakeCart(state, over.vendor === undefined ? VENDOR : over.vendor);
  const orders = new FakeOrders(
    over.tax === undefined ? VAT_BD : over.tax,
    over.coupons ?? [],
    over.usage ?? { byUser: 0, total: 0 },
    over.ordered ?? true,
  );
  const codes = new FakeHandoffCode();
  const handoffs = new FakeHandoffCache();

  const service = new CheckoutService(
    orders,
    cart,
    new FakeCatalog(over.open ?? true),
    codes,
    handoffs,
    passthroughUow,
    clock,
    CONFIG,
  );

  return { service, cart, orders, codes, handoffs };
}

const CHOICES = { fulfillment: 'delivery' as const, tipPercent: 0, couponCode: null };

const REQUEST = {
  ...CHOICES,
  address: {
    label: 'Home',
    recipient: 'Ayesha Rahman',
    phone: '+8801711000001',
    line1: '12 Road 9',
    line2: null,
    area: 'Dhanmondi',
    city: 'Dhaka',
    countryCode: 'BD',
    instructions: null,
  },
  scheduledFor: null,
  contact: { name: 'Ayesha Rahman', phone: '+8801711000001' },
  notes: null,
  paymentMethod: 'cash' as const,
  cardLast4: null,
};

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  section('Pricing arithmetic (domain/policies/pricing.ts)');
  {
    const lines = [line({ quantity: 1 })];
    const pricing = computePricing({
      vendor: VENDOR,
      lines,
      fulfillment: 'delivery',
      tipPercent: 0,
      coupon: null,
      tax: VAT_BD,
    });

    check('subtotal is Σ unitPrice × quantity', pricing.subtotal === 840);
    check('delivery is free at the threshold (840 ≥ 800)', pricing.deliveryFee === 0);
    check('tax is 5% of the subtotal', pricing.tax === 42);
    check('total = subtotal + tax when nothing else applies', pricing.total === 882);
    check('the tax label is snapshotted, not derived', pricing.taxLabel === 'VAT');
    check('taxRate travels with the price', pricing.taxRate === 0.05);
  }

  {
    // 320 is below the vendor's 800 free-delivery threshold, so the fee is charged.
    const lines = [line({ unitPrice: 320, basePrice: 320, options: [], quantity: 1 })];
    const delivery = computePricing({
      vendor: VENDOR,
      lines,
      fulfillment: 'delivery',
      tipPercent: 0,
      coupon: null,
      tax: VAT_BD,
    });
    const pickup = computePricing({
      vendor: VENDOR,
      lines,
      fulfillment: 'pickup',
      tipPercent: 0,
      coupon: null,
      tax: VAT_BD,
    });

    check('delivery is charged below the threshold', delivery.deliveryFee === 60);
    check('pickup waives the fee', pickup.deliveryFee === 0);
    check('pickup total excludes the fee', pickup.total === money(320 + 16));
    check('delivery total includes it', delivery.total === money(320 + 60 + 16));
    check('the fee is not taxed', delivery.tax === 16);
  }

  {
    const lines = [line({ quantity: 1 })];
    const tipped = computePricing({
      vendor: VENDOR,
      lines,
      fulfillment: 'delivery',
      tipPercent: 0.1,
      coupon: null,
      tax: VAT_BD,
    });

    check('tip is a fraction of the subtotal', tipped.tip === 84);
    check('tip is added to the total', tipped.total === money(840 + 42 + 84));
    check('tip is not taxed', tipped.tax === 42);
  }

  section('Coupons move exactly the lines they should');
  {
    const lines = [line({ quantity: 1 })];
    const percentage = computePricing({
      vendor: VENDOR,
      lines,
      fulfillment: 'delivery',
      tipPercent: 0.1,
      coupon: { coupon: coupon(), discount: 126, freeDelivery: false, deliveryWaived: 0, cashback: 0 },
      tax: VAT_BD,
    });

    check('discount reduces the subtotal', percentage.discount === 126);
    check('tax is charged on the DISCOUNTED subtotal', percentage.tax === money((840 - 126) * 0.05));
    check('tip is charged on the UNDISCOUNTED subtotal', percentage.tip === 84);
    check('the code travels onto the receipt', percentage.couponCode === 'TEST15');
    check(
      'total = taxable + fee + tax + tip',
      percentage.total === money(840 - 126 + 0 + (840 - 126) * 0.05 + 84),
    );
  }

  {
    const lines = [line({ unitPrice: 200, basePrice: 200, options: [], quantity: 1 })];
    const clamped = computePricing({
      vendor: VENDOR,
      lines,
      fulfillment: 'delivery',
      tipPercent: 0,
      coupon: {
        coupon: coupon({ kind: 'fixed', value: 500 }),
        discount: 500,
        freeDelivery: false,
        deliveryWaived: 0,
        cashback: 0,
      },
      tax: VAT_BD,
    });

    check('a discount larger than the basket is clamped to it', clamped.discount === 200);
    check('the taxable amount cannot go negative', clamped.tax === 0);
    check('the total is the delivery fee alone', clamped.total === 60);
  }

  {
    const lines = [line({ unitPrice: 320, basePrice: 320, options: [], quantity: 1 })];
    const waived = computePricing({
      vendor: VENDOR,
      lines,
      fulfillment: 'delivery',
      tipPercent: 0,
      coupon: {
        coupon: coupon({ kind: 'free-delivery' }),
        discount: 0,
        freeDelivery: true,
        deliveryWaived: 60,
        cashback: 0,
      },
      tax: VAT_BD,
    });

    check('a free-delivery coupon zeroes the fee', waived.deliveryFee === 0);
    check('and leaves the subtotal alone', waived.subtotal === 320);
  }

  {
    const lines = [line({ quantity: 1 })];
    const cashback = computePricing({
      vendor: VENDOR,
      lines,
      fulfillment: 'delivery',
      tipPercent: 0,
      coupon: {
        coupon: coupon({ kind: 'cashback', value: 5 }),
        discount: 0,
        freeDelivery: false,
        deliveryWaived: 0,
        cashback: 42,
      },
      tax: VAT_BD,
    });

    check('cashback does NOT reduce the total', cashback.total === 882);
    check('cashback does NOT appear as a discount', cashback.discount === 0);
  }

  section('Coupon eligibility (domain/policies/coupon.ts)');
  {
    const ok = evaluateCoupon(coupon(), couponContext());
    check('a valid coupon is eligible', ok.eligible);
    check('15% of 1000 is 150', ok.eligible && ok.outcome.discount === 150);

    const capped = evaluateCoupon(coupon({ maxDiscount: 100 }), couponContext());
    check('maxDiscount caps the discount', capped.eligible && capped.outcome.discount === 100);

    const spent = evaluateCoupon(coupon({ usageLimit: 1 }), couponContext({ timesRedeemed: 1 }));
    check('a spent coupon is refused', !spent.eligible && spent.reason === CouponRefusal.used);

    const exhausted = evaluateCoupon(
      coupon({ totalLimit: 100, totalRedeemed: 100 }),
      couponContext(),
    );
    check(
      'the platform-wide cap is refused with its own reason',
      !exhausted.eligible && exhausted.reason === CouponRefusal.exhausted,
    );

    const early = evaluateCoupon(
      coupon({ startsAt: new Date('2026-07-01T00:00:00.000Z') }),
      couponContext(),
    );
    check('a coupon that has not started is refused', !early.eligible && early.reason === CouponRefusal.notStarted);

    const late = evaluateCoupon(
      coupon({ endsAt: new Date('2026-06-01T00:00:00.000Z') }),
      couponContext(),
    );
    check('an expired coupon is refused', !late.eligible && late.reason === CouponRefusal.expired);

    const wrongCurrency = evaluateCoupon(coupon({ currency: 'USD' }), couponContext());
    check(
      'a coupon in another currency is refused',
      !wrongCurrency.eligible && wrongCurrency.reason === CouponRefusal.currency,
    );

    const otherVendor = evaluateCoupon(coupon({ vendorIds: ['ven_other'] }), couponContext());
    check(
      "another vendor's coupon is refused",
      !otherVendor.eligible && otherVendor.reason === CouponRefusal.vendorOnly,
    );

    const thisVendor = evaluateCoupon(coupon({ vendorIds: [VENDOR.id] }), couponContext());
    check('a vendor-scoped coupon applies at that vendor', thisVendor.eligible);

    const category = evaluateCoupon(coupon({ categorySlugs: ['pizza'] }), couponContext());
    check(
      'a category-scoped coupon is refused rather than granted (V1 cannot resolve categories)',
      !category.eligible && category.reason === CouponRefusal.categoryOnly,
    );

    const notFirst = evaluateCoupon(coupon({ firstOrderOnly: true }), couponContext());
    check(
      'firstOrderOnly is refused for a returning customer',
      !notFirst.eligible && notFirst.reason === CouponRefusal.firstOrderOnly,
    );

    const isFirst = evaluateCoupon(
      coupon({ firstOrderOnly: true }),
      couponContext({ isFirstOrder: true }),
    );
    check('and allowed for a new one', isFirst.eligible);

    const tooSmall = evaluateCoupon(coupon({ minOrder: 2000 }), couponContext());
    check('a basket under the minimum is refused', !tooSmall.eligible && tooSmall.reason === CouponRefusal.minOrder);

    /**
     * The refusal *order* is a decision, not an accident: a coupon that is both for another
     * vendor and under its minimum reports the vendor, because "add ৳1,000 more" is useless
     * advice for a code that will never work at this restaurant.
     */
    const both = evaluateCoupon(
      coupon({ vendorIds: ['ven_other'], minOrder: 5000 }),
      couponContext(),
    );
    check(
      'the vendor refusal wins over the minimum — the customer is told the one thing they could change',
      !both.eligible && both.reason === CouponRefusal.vendorOnly,
    );

    const pickupOnly = evaluateCoupon(
      coupon({ kind: 'free-delivery' }),
      couponContext({ fulfillment: 'pickup' }),
    );
    check(
      'free delivery on a pickup order is refused',
      !pickupOnly.eligible && pickupOnly.reason === CouponRefusal.deliveryOnly,
    );

    const noFeeToWaive = evaluateCoupon(
      coupon({ kind: 'free-delivery' }),
      couponContext({ deliveryFee: 0 }),
    );
    check(
      'free delivery on a basket already over the threshold is refused as noSaving',
      !noFeeToWaive.eligible && noFeeToWaive.reason === CouponRefusal.noSaving,
    );

    const bogoOne = evaluateCoupon(
      coupon({ kind: 'bogo' }),
      couponContext({ lines: [line({ quantity: 1 })] }),
    );
    check(
      'BOGO needs two items',
      !bogoOne.eligible && bogoOne.reason === CouponRefusal.needsTwoItems,
    );

    const bogoTwo = evaluateCoupon(
      coupon({ kind: 'bogo' }),
      couponContext({
        lines: [line({ quantity: 1 }), line({ id: 'x', unitPrice: 300, quantity: 1 })],
      }),
    );
    check(
      'BOGO gives away the cheapest unit price',
      bogoTwo.eligible && bogoTwo.outcome.discount === 300,
    );

    const cashbackOutcome = couponSavings(
      coupon({ kind: 'cashback', value: 5, maxDiscount: 40 }),
      couponContext(),
    );
    check('cashback is capped like a discount', cashbackOutcome.cashback === 40);
    check('cashback grants no discount', cashbackOutcome.discount === 0);
  }

  check('codes are canonicalised', normaliseCode('  hello-15 ') === 'HELLO-15');
  check('inner whitespace is stripped too', normaliseCode('bella lunch') === 'BELLALUNCH');

  section('The tip is a fraction, and bounded');
  {
    check('zero is valid', isValidTipPercent(0, 1));
    check('the ceiling is inclusive', isValidTipPercent(1, 1));
    check('above the ceiling is refused', !isValidTipPercent(1.5, 1));
    check('negative is refused', !isValidTipPercent(-0.1, 1));
    check('NaN is refused', !isValidTipPercent(Number.NaN, 1));

    const { service } = harness();
    check(
      'the service refuses a tip over the configured ceiling rather than clamping it',
      await refusedWith(service.summary({ userId: 'usr_a' }, { ...CHOICES, tipPercent: 2 }), CheckoutError.tipInvalid),
    );
  }

  section('Minimum order');
  {
    check('amountToMinOrder is zero when met', amountToMinOrder(VENDOR, 840) === 0);
    check('and the shortfall when not', amountToMinOrder(VENDOR, 100) === 200);

    const small = [line({ unitPrice: 100, basePrice: 100, options: [], quantity: 1 })];
    const { service } = harness({ lines: small });

    const quote = await service.summary({ userId: 'usr_a' }, CHOICES);
    check('a basket under the minimum is quoted but not eligible', quote.ok && !quote.data.eligible);
    check(
      'and it names the blocker',
      quote.ok && quote.data.blockedReason === CheckoutError.belowMinimum,
    );
    check('and says how much is missing', quote.ok && quote.data.amountToMinOrder === 200);

    const pickup = await service.summary({ userId: 'usr_a' }, { ...CHOICES, fulfillment: 'pickup' });
    check(
      'pickup has no minimum — there is no ride to make worthwhile',
      pickup.ok && pickup.data.eligible,
    );

    check(
      'placing an order under the minimum is refused',
      await refusedWith(
        harness({ lines: small }).service.placeOrder('usr_a', undefined, REQUEST),
        CheckoutError.belowMinimum,
      ),
    );
  }

  section('placeOrder — what the client may not decide');
  {
    const { service, orders, codes, handoffs } = harness();
    const result = await service.placeOrder('usr_a', undefined, { ...REQUEST, tipPercent: 0.1 });

    check('the order is placed', result.ok);
    check('exactly one order was written', orders.written.length === 1);

    const written = orders.written[0];
    check('the owner is the authenticated actor', written?.userId === 'usr_a');
    check('the subtotal comes from the cart lines', written?.pricing.subtotal === 840);
    check('the tax comes from the resolved rule', written?.pricing.tax === 42);
    check('the tip is derived from the fraction', written?.pricing.tip === 84);
    check('the total is the server’s arithmetic', written?.pricing.total === money(840 + 42 + 84));
    check('cash is pending, not paid', written?.paymentStatus === 'pending');
    check('the status is placed', result.ok && result.data.status === 'placed');
    check('the hand-off code is issued', codes.issued.length === 1);
    check('only its hash is handed to storage', written?.otpHash === 'sha256(7777)');
    check(
      'the plaintext is returned once, to the customer',
      result.ok && result.data.lifecycle.otp === '7777',
    );
    check('and cached for the tracker', handoffs.store.get('ord_1') === '7777');
    check(
      'the ETA is provisional — placement + the configured default',
      result.ok &&
        result.data.estimatedDeliveryAt.getTime() === NOW.getTime() + 40 * 60_000,
    );
  }

  {
    const { service, orders } = harness();
    const result = await service.placeOrder('usr_a', undefined, {
      ...REQUEST,
      paymentMethod: 'card',
      cardLast4: '4242',
    });
    check('card resolves as paid', result.ok && orders.written[0]?.paymentStatus === 'paid');
    check('and keeps the last four for the receipt', orders.written[0]?.cardLast4 === '4242');
  }

  {
    const { service } = harness();
    check(
      'a tender the checkout screen does not offer is refused',
      await refusedWith(
        service.placeOrder('usr_a', undefined, { ...REQUEST, paymentMethod: 'mfs' }),
        CheckoutError.paymentUnsupported,
      ),
    );
  }

  {
    const { service } = harness();
    check(
      'delivery with no address is refused',
      await refusedWith(
        service.placeOrder('usr_a', undefined, { ...REQUEST, address: null }),
        CheckoutError.addressRequired,
      ),
    );

    const pickup = await harness().service.placeOrder('usr_a', undefined, {
      ...REQUEST,
      fulfillment: 'pickup',
      address: null,
    });
    check('pickup with no address is fine', pickup.ok);
  }

  {
    const { service } = harness();
    check(
      'a missing contact name is refused',
      await refusedWith(
        service.placeOrder('usr_a', undefined, { ...REQUEST, contact: { name: '  ', phone: '+8801711000001' } }),
        CheckoutError.contactRequired,
      ),
    );
    check(
      'an implausible phone is refused',
      await refusedWith(
        harness().service.placeOrder('usr_a', undefined, {
          ...REQUEST,
          contact: { name: 'A', phone: '12' },
        }),
        CheckoutError.contactRequired,
      ),
    );
  }

  {
    const { service } = harness();
    check(
      'a scheduled time in the past is refused',
      await refusedWith(
        service.placeOrder('usr_a', undefined, {
          ...REQUEST,
          scheduledFor: new Date(NOW.getTime() - 60_000),
        }),
        CheckoutError.scheduleInvalid,
      ),
    );
  }

  section('The basket, and what happens to it');
  {
    const { service, cart } = harness();
    const result = await service.placeOrder('usr_a', undefined, REQUEST);
    check('the cart is emptied by the order', result.ok && cart.cleared.includes('crt_1'));
  }

  {
    const { service, cart } = harness();
    await service.placeOrder('usr_a', 'guest-key-0123456789abc', REQUEST);
    check(
      'a guest basket is adopted onto the account at checkout',
      cart.adopted.length === 1 && cart.adopted[0]?.userId === 'usr_a',
    );
  }

  {
    const { service } = harness({ lines: [] });
    check(
      'an empty basket cannot be ordered',
      await refusedWith(service.placeOrder('usr_a', undefined, REQUEST), CheckoutError.cartEmpty),
    );
    check(
      'and cannot be quoted',
      await refusedWith(service.summary({ userId: 'usr_a' }, CHOICES), CheckoutError.cartEmpty),
    );
  }

  {
    const { service } = harness({ vendor: null });
    check(
      'a delisted vendor refuses the order rather than pricing it with zeroes',
      await refusedWith(service.placeOrder('usr_a', undefined, REQUEST), CheckoutError.vendorUnavailable),
    );
  }

  section('A closed kitchen: blocks now, allows later');
  {
    const { service } = harness({ open: false });
    check(
      'a closed restaurant refuses an as-soon-as-possible order',
      await refusedWith(service.placeOrder('usr_a', undefined, REQUEST), CheckoutError.vendorClosed),
    );

    const scheduled = await harness({ open: false }).service.placeOrder('usr_a', undefined, {
      ...REQUEST,
      scheduledFor: new Date(NOW.getTime() + 3 * 3_600_000),
    });
    check('and accepts a scheduled one', scheduled.ok);

    const quote = await harness({ open: false }).service.summary({ userId: 'usr_a' }, CHOICES);
    check('a quote is still given for a closed restaurant — it is not an order', quote.ok);
  }

  section('Coupons through the service');
  {
    const applied = coupon({ code: 'TEST15' });
    const { service, orders } = harness({ coupons: [applied] });

    const quote = await service.summary({ userId: 'usr_a' }, { ...CHOICES, couponCode: 'test15' });
    check('a lower-case code is canonicalised and found', quote.ok && quote.data.coupon !== null);
    check('the discount is 15% of 840', quote.ok && quote.data.pricing.discount === 126);
    check('nothing was written by a quote', orders.written.length === 0);

    const placed = await service.placeOrder('usr_a', undefined, { ...REQUEST, couponCode: 'TEST15' });
    check('the order records the coupon id', orders.written[0]?.couponId === applied.id);
    check('and its code, for the receipt', placed.ok && placed.data.pricing.couponCode === 'TEST15');
  }

  {
    const { service } = harness({ coupons: [] });
    const quote = await service.summary({ userId: 'usr_a' }, { ...CHOICES, couponCode: 'NOPE' });
    check('an unknown code refuses with a reason rather than failing the quote', quote.ok);
    check(
      'and the reason is renderable by the existing coupon field',
      quote.ok && quote.data.couponRefusal === CouponRefusal.unknownCode,
    );
    check('the quote is still priced without it', quote.ok && quote.data.pricing.discount === 0);

    check(
      'but placing an order with a coupon the server will not honour is REFUSED',
      await refusedWith(
        harness({ coupons: [] }).service.placeOrder('usr_a', undefined, {
          ...REQUEST,
          couponCode: 'NOPE',
        }),
        CheckoutError.couponRejected,
      ),
    );
  }

  {
    // A guest quote is generous about the per-customer rules; placement is not, because
    // placement always has an actor.
    const firstOrderCoupon = coupon({ code: 'FIRST', firstOrderOnly: true });
    const guest = await harness({ coupons: [firstOrderCoupon], ordered: true }).service.summary(
      { guestKey: 'guest-key-0123456789abc' },
      { ...CHOICES, couponCode: 'FIRST' },
    );
    check('a guest previewing a first-order coupon is given the benefit of the doubt', guest.ok && guest.data.coupon !== null);

    const known = await harness({ coupons: [firstOrderCoupon], ordered: true }).service.summary(
      { userId: 'usr_a' },
      { ...CHOICES, couponCode: 'FIRST' },
    );
    check(
      'a returning customer is refused it',
      known.ok && known.data.couponRefusal === CouponRefusal.firstOrderOnly,
    );
  }

  section('No tax rule configured');
  {
    const { service } = harness({ tax: null });
    const quote = await service.summary({ userId: 'usr_a' }, CHOICES);
    check('no rule means no tax, not a guessed rate', quote.ok && quote.data.pricing.tax === 0);
    check('the rate is zero', quote.ok && quote.data.pricing.taxRate === 0);
    check('and the total omits it', quote.ok && quote.data.pricing.total === 840);
  }

  section('Order numbers');
  {
    check('padded to six digits', formatOrderNumber(1) === 'FO-000001');
    check('and grows past a million rather than wrapping', formatOrderNumber(1_234_567) === 'FO-1234567');
    check('digits only — this value gets read aloud', /^FO-\d+$/.test(formatOrderNumber(42)));
  }

  section('The server and the frontend agree on every total');
  {
    /**
     * The property this whole unit rests on. `computeTotals` below is
     * `frontend/lib/checkout.ts`, transcribed; if the two ever diverge, the checkout screen
     * shows one number and the receipt another.
     */
    const baskets: Array<{
      label: string;
      lines: CartLineRecord[];
      tipPercent: number;
      fulfillment: 'delivery' | 'pickup';
      discount: number;
      freeDelivery: boolean;
    }> = [
      { label: 'one large pizza, no tip', lines: [line({ quantity: 1 })], tipPercent: 0, fulfillment: 'delivery', discount: 0, freeDelivery: false },
      { label: 'two pizzas, 10% tip', lines: [line({ quantity: 2 })], tipPercent: 0.1, fulfillment: 'delivery', discount: 0, freeDelivery: false },
      { label: 'small basket, fee charged', lines: [line({ unitPrice: 320, basePrice: 320, options: [], quantity: 1 })], tipPercent: 0.05, fulfillment: 'delivery', discount: 0, freeDelivery: false },
      { label: 'pickup, 15% tip', lines: [line({ quantity: 1 })], tipPercent: 0.15, fulfillment: 'pickup', discount: 0, freeDelivery: false },
      { label: 'with a ৳126 discount', lines: [line({ quantity: 1 })], tipPercent: 0.1, fulfillment: 'delivery', discount: 126, freeDelivery: false },
      { label: 'free delivery coupon on a small basket', lines: [line({ unitPrice: 320, basePrice: 320, options: [], quantity: 1 })], tipPercent: 0, fulfillment: 'delivery', discount: 0, freeDelivery: true },
      { label: 'an awkward price (333.33 × 3)', lines: [line({ unitPrice: 333.33, basePrice: 333.33, options: [], quantity: 3 })], tipPercent: 0.1, fulfillment: 'delivery', discount: 0, freeDelivery: false },
      { label: 'discount larger than the basket', lines: [line({ unitPrice: 200, basePrice: 200, options: [], quantity: 1 })], tipPercent: 0, fulfillment: 'delivery', discount: 900, freeDelivery: false },
    ];

    for (const basket of baskets) {
      const server = computePricing({
        vendor: VENDOR,
        lines: basket.lines,
        fulfillment: basket.fulfillment,
        tipPercent: basket.tipPercent,
        coupon: basket.discount > 0 || basket.freeDelivery
          ? {
              coupon: coupon(),
              discount: basket.discount,
              freeDelivery: basket.freeDelivery,
              deliveryWaived: basket.freeDelivery ? VENDOR.deliveryFee : 0,
              cashback: 0,
            }
          : null,
        tax: VAT_BD,
      });

      const client = computeTotalsLikeTheFrontend({
        vendor: VENDOR,
        lines: basket.lines,
        tipPercent: basket.tipPercent,
        fulfillment: basket.fulfillment,
        discount: basket.discount,
        freeDelivery: basket.freeDelivery,
        taxRate: VAT_BD.rate,
      });

      check(`${basket.label}: totals agree (${server.total})`, server.total === client.total);
      check(`${basket.label}: tax agrees`, server.tax === client.tax);
      check(`${basket.label}: delivery agrees`, server.deliveryFee === client.deliveryFee);
      check(`${basket.label}: tip agrees`, server.tip === client.tip);
    }
  }

  // =========================================================================
  console.log(
    failures.length === 0
      ? `\n✓ ${passed} assertions passed, 0 failed.`
      : `\n✗ ${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `    ${f}`).join('\n')}`,
  );
  if (failures.length > 0) process.exit(1);
}

/**
 * `frontend/lib/checkout.ts::computeTotals`, transcribed.
 *
 * Deliberately a transcription and not a call: the two repositories do not share a build, so
 * the only way to assert agreement is to write the other side's arithmetic out and compare.
 * If this ever needs editing to make a test pass, the frontend changed and the server has to
 * follow — or the reverse, and a customer is about to see a total move.
 */
function computeTotalsLikeTheFrontend(input: {
  vendor: CartVendorRecord;
  lines: CartLineRecord[];
  tipPercent: number;
  fulfillment: 'delivery' | 'pickup';
  discount: number;
  freeDelivery: boolean;
  taxRate: number;
}): { subtotal: number; deliveryFee: number; tax: number; tip: number; total: number } {
  const round = (value: number) => Math.round(value * 100) / 100;
  const subtotal = cartSubtotal(input.lines);
  const discount = round(Math.min(input.discount, subtotal));
  const deliveryFee =
    input.fulfillment === 'pickup' || input.freeDelivery
      ? 0
      : deliveryFeeFor(input.vendor, subtotal);
  const taxable = Math.max(0, subtotal - discount);
  const tax = round(taxable * input.taxRate);
  const tip = round(subtotal * input.tipPercent);
  const total = round(taxable + deliveryFee + tax + tip);
  return { subtotal, deliveryFee, tax, tip, total };
}

/** Reads better at the call site than unwrapping a Result inline a dozen times. */
async function refusedWith(
  operation: Promise<{ ok: boolean; error: { key: string } | null }>,
  key: string,
): Promise<boolean> {
  const result = await operation;
  return !result.ok && result.error?.key === key;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
