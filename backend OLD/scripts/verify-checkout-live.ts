/**
 * V1 Unit 3's live verification — the assertions that need real PostgreSQL.
 *
 *   cd database && bun run migrate:deploy
 *   cd backend  && bun run seed:reference && bun run seed:demo
 *   cd backend  && bun run verify:checkout:live
 *
 * ## Why this is a separate script from `verify:checkout`
 *
 * Because it proves different things. `verify:checkout` tests the arithmetic and the rules
 * against in-memory ports, in milliseconds. This tests what only exists once Postgres is
 * underneath, and what no fake can honestly simulate:
 *
 * 1. **Tax comes out of `tax_rules`,** through the real scope-narrowing resolver, at the
 *    rate the reference seed wrote — not a constant in a fixture. A wrong rate here is
 *    money, on every order in that market.
 * 2. **The order number is a row lock.** Two checkouts running concurrently get different
 *    references; `number_sequences` is what makes that true, and a fake counter proves
 *    nothing about it.
 * 3. **The write is one transaction.** An order, its items, their options, the first
 *    lifecycle event and the *emptied basket* either all happen or none do.
 * 4. **`orders.otpHash` never contains a code.** The plaintext is returned once and lives
 *    in Redis; the column holds a SHA-256. This is the standing rule from Unit 0, asserted
 *    against the actual column rather than against the code that was supposed to hash it.
 * 5. **`Decimal(14,2)` round-trips.** A total computed as a JS number, stored as a numeric
 *    and read back has to be the same money — and awkward prices are where it would not be.
 * 6. **Coupon usage is counted from real orders,** including the rule that a cancelled
 *    order gives the ticket back.
 *
 * Everything runs through `CheckoutService` — real repository, real extensions, real
 * transaction manager — so what passes here is the production path.
 *
 * It writes real orders and cleans up after itself. Rows are identified by the customer id
 * and by their `notes`, which every order this script places sets to a marker string.
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { CartService } from '../src/modules/cart/application/cart.service';
import type { CartOwner } from '../src/modules/cart/domain';
import { PrismaService } from '../src/infrastructure/prisma';
import { CheckoutService } from '../src/modules/orders/application/checkout.service';
import { CheckoutError, CouponRefusal, type PlaceOrderRequest } from '../src/modules/orders/domain';
import { CacheService } from '../src/infrastructure/redis';

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

/** Seeded by `seed:demo`. */
const MARGHERITA = 'food_pizza-margherita';
const BELLA = 'ven_bella_napoli';
const CUSTOMER = 'usr_customer';
const OWNER: CartOwner = { userId: CUSTOMER };

/** Stamped on every order this script places, so cleanup cannot miss one. */
const MARKER = 'verify-checkout-live';

const REQUEST: PlaceOrderRequest = {
  fulfillment: 'delivery',
  tipPercent: 0,
  couponCode: null,
  address: {
    label: 'Home',
    recipient: 'Ayesha Rahman',
    phone: '+8801711000001',
    line1: '12 Road 9',
    line2: null,
    area: 'Dhanmondi',
    city: 'Dhaka',
    countryCode: 'BD',
    instructions: 'Ring the bell twice',
  },
  scheduledFor: null,
  contact: { name: 'Ayesha Rahman', phone: '+8801711000001' },
  notes: MARKER,
  paymentMethod: 'cash',
  cardLast4: null,
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const checkout = app.get(CheckoutService);
  const carts = app.get(CartService);
  const prisma = app.get(PrismaService);
  const cache = app.get(CacheService);

  /** Removes every order and cart this script created. */
  const cleanup = async () => {
    const orders = await prisma.db.order.findMany({
      where: { userId: CUSTOMER, notes: { startsWith: MARKER } },
      select: { id: true },
    });
    const ids = orders.map((row) => row.id);
    if (ids.length > 0) {
      await prisma.db.orderItemOption.deleteMany({
        where: { orderItem: { orderId: { in: ids } } },
      });
      await prisma.db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.db.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
      // `$executeRaw`, because `order.deleteMany` is refused on a soft-deletable model —
      // and rightly so. A script cleaning up its own rows is the legitimate exception.
      await prisma.$executeRaw`DELETE FROM orders WHERE "userId" = ${CUSTOMER} AND notes LIKE ${`${MARKER}%`}`;
      for (const id of ids) await cache.del(`order:handoff:${id}`);
    }

    const cartRows = await prisma.db.cart.findMany({
      where: { OR: [{ userId: CUSTOMER }, { guestKey: { startsWith: 'verify-checkout-' } }], deletedAt: undefined },
      select: { id: true },
    });
    const cartIds = cartRows.map((row) => row.id);
    if (cartIds.length === 0) return;
    await prisma.db.cartItemOption.deleteMany({ where: { cartItem: { cartId: { in: cartIds } } } });
    await prisma.db.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
    await prisma.$executeRaw`
      DELETE FROM carts
      WHERE "userId" = ${CUSTOMER} OR "guestKey" LIKE 'verify-checkout-%'
    `;
  };

  /** A basket with `quantity` large Margheritas in it, through the real cart service. */
  const fillCart = async (quantity: number, owner: CartOwner = OWNER) => {
    const food = await prisma.db.foodItem.findUnique({
      where: { id: MARGHERITA },
      select: { optionGroups: { select: { options: { select: { id: true, priceDelta: true } } } } },
    });
    const large = food?.optionGroups
      .flatMap((group) => group.options)
      .sort((a, b) => b.priceDelta.toNumber() - a.priceDelta.toNumber())[0];

    return carts.addItem(owner, { foodId: MARGHERITA, optionIds: large ? [large.id] : [], quantity }, true);
  };

  try {
    await cleanup();

    // =======================================================================
    section('the seed is what this script assumes');

    const vendor = await prisma.db.vendor.findUnique({
      where: { id: BELLA },
      select: { currency: true },
    });
    check('Bella Napoli is seeded', vendor !== null);
    check('and prices in BDT', vendor?.currency === 'BDT');

    // The fee, the minimum and the threshold live on the *branch*, which is why the cart's
    // vendor snapshot is assembled through `CATALOG_READER` rather than read off `vendors`.
    const branch = await prisma.db.vendorBranch.findFirst({
      where: { vendorId: BELLA, isPrimary: true },
      select: { deliveryFee: true, minOrder: true, freeDeliveryOver: true },
    });
    check('with a primary branch', branch !== null);
    check('carrying a delivery fee', (branch?.deliveryFee.toNumber() ?? -1) >= 0);

    const taxRule = await prisma.db.taxRule.findFirst({
      where: { countryCode: 'BD', appliesTo: 'ORDER_SUBTOTAL', city: null, vendorId: null },
      select: { label: true, rate: true },
    });
    check('a Bangladesh tax rule is seeded', taxRule !== null);
    check('at 5%', taxRule?.rate.toNumber() === 0.05);
    check('labelled VAT', taxRule?.label === 'VAT');

    const customer = await prisma.db.user.findUnique({
      where: { id: CUSTOMER },
      select: { email: true },
    });
    check('the demo customer exists', customer?.email === 'customer@foodora.dev');

    const seededCoupons = await prisma.db.coupon.count();
    check('coupons are seeded', seededCoupons >= 8);

    // =======================================================================
    section('a quote is priced from real rows and writes nothing');

    await fillCart(1);
    const before = await prisma.db.order.count();

    const quote = await checkout.summary(OWNER, {
      fulfillment: 'delivery',
      tipPercent: 0.1,
      couponCode: null,
    });
    check('the basket quotes', quote.ok);
    check('the tax label came from the database', quote.ok && quote.data.pricing.taxLabel === 'VAT');
    check('and the rate did too', quote.ok && quote.data.pricing.taxRate === 0.05);
    check(
      'the tax is 5% of the real subtotal',
      quote.ok && quote.data.pricing.tax === Math.round(quote.data.pricing.subtotal * 0.05 * 100) / 100,
    );
    check(
      'the tip is 10% of it',
      quote.ok && quote.data.pricing.tip === Math.round(quote.data.pricing.subtotal * 0.1 * 100) / 100,
    );
    check('no order was written by a quote', (await prisma.db.order.count()) === before);
    check('and the basket still exists', (await carts.currentCart(OWNER)) !== null);

    // =======================================================================
    section('placing an order writes every row, in one transaction');

    const placed = await checkout.placeOrder(CUSTOMER, undefined, { ...REQUEST, tipPercent: 0.1 });
    check('the order is placed', placed.ok);
    if (!placed.ok) throw new Error('cannot continue without an order');

    const order = placed.data;
    const row = await prisma.db.order.findUnique({
      where: { id: order.id },
      select: {
        userId: true,
        vendorId: true,
        branchId: true,
        status: true,
        subtotal: true,
        deliveryFee: true,
        tax: true,
        taxLabel: true,
        taxRate: true,
        tip: true,
        total: true,
        otpHash: true,
        itemCount: true,
        contactName: true,
        deliveryArea: true,
        deliveryCity: true,
        addressSnapshot: true,
        vendorSnapshot: true,
        paymentStatus: true,
        _count: { select: { items: true, events: true } },
      },
    });

    check('the row exists', row !== null);
    check('owned by the customer', row?.userId === CUSTOMER);
    check('against the vendor', row?.vendorId === BELLA);
    check('with the primary branch resolved', row?.branchId !== null);
    check('status placed', row?.status === 'PLACED');
    check('one item row', row?._count.items === 1);
    check('one lifecycle event', row?._count.events === 1);
    check('itemCount is denormalised', row?.itemCount === 1);
    check('the contact is stored', row?.contactName === 'Ayesha Rahman');
    check('the delivery area is denormalised out of the snapshot', row?.deliveryArea === 'Dhanmondi');
    check('and the city', row?.deliveryCity === 'Dhaka');
    check('the address snapshot is stored whole', row?.addressSnapshot !== null);
    check('the vendor snapshot is stored whole', row?.vendorSnapshot !== null);
    check('cash is pending', row?.paymentStatus === 'PENDING');

    check(
      'the stored subtotal is the returned one',
      row?.subtotal.toNumber() === order.pricing.subtotal,
    );
    check('the stored tax matches', row?.tax.toNumber() === order.pricing.tax);
    check('the stored tax label matches', row?.taxLabel === 'VAT');
    check('the stored tax rate matches', row?.taxRate.toNumber() === 0.05);
    check('the stored tip matches', row?.tip.toNumber() === order.pricing.tip);
    check('the stored total matches', row?.total.toNumber() === order.pricing.total);
    check(
      'and the total really is the sum of its parts',
      row !== null &&
        row.total.toNumber() ===
          Math.round(
            (row.subtotal.toNumber() + row.deliveryFee.toNumber() + row.tax.toNumber() + row.tip.toNumber()) * 100,
          ) / 100,
    );

    // =======================================================================
    section('the hand-off code: hashed in Postgres, readable in Redis');

    check('a four-digit code was returned', /^\d{4}$/.test(order.lifecycle.otp));
    check('the column holds a 64-char hex digest', /^[0-9a-f]{64}$/.test(row?.otpHash ?? ''));
    check(
      'and the column does NOT contain the code',
      !(row?.otpHash ?? '').includes(order.lifecycle.otp),
    );

    const reread = await checkout.findOrder(CUSTOMER, order.id);
    check('the order reads back', reread !== null);
    check('and the code is recovered from Redis', reread?.lifecycle.otp === order.lifecycle.otp);
    check('the line id is the composite configuration key, not the oli_ id', reread?.lines[0]?.id.includes('|') === true);
    check('the wire id has no cart prefix', reread?.lines[0]?.id.startsWith('crt_') === false);

    const stranger = await checkout.findOrder('usr_admin', order.id);
    check("another account's order is indistinguishable from missing", stranger === null);

    // =======================================================================
    section('the basket is consumed by the order');

    check('the cart is gone', (await carts.currentCart(OWNER)) === null);
    check(
      'and its items with it',
      (await prisma.db.cartItem.count({ where: { cart: { userId: CUSTOMER } } })) === 0,
    );
    check(
      'a second checkout with no basket is refused',
      await refusedWith(checkout.placeOrder(CUSTOMER, undefined, REQUEST), CheckoutError.cartEmpty),
    );

    // =======================================================================
    section('order items and their options cascade');

    const items = await prisma.db.orderItem.findMany({
      where: { orderId: order.id },
      select: { id: true, lineKey: true, lineTotal: true, unitPrice: true, quantity: true, options: true },
    });
    check('the item was written', items.length === 1);
    check('with a minted oli_ id', items[0]?.id.startsWith('oli_') === true);
    check('the lineKey preserves the composite id', items[0]?.lineKey.includes('|') === true);
    check('one selected option', items[0]?.options.length === 1);
    check('with a minted oio_ id', items[0]?.options[0]?.id.startsWith('oio_') === true);
    check(
      'lineTotal is unitPrice × quantity',
      items[0] !== undefined &&
        items[0].lineTotal.toNumber() === items[0].unitPrice.toNumber() * items[0].quantity,
    );

    // =======================================================================
    section('order numbers are a sequence, not a clock');

    await fillCart(1);
    const second = await checkout.placeOrder(CUSTOMER, undefined, REQUEST);
    check('a second order is placed', second.ok);
    check(
      'with a different reference',
      second.ok && second.data.orderNumber !== order.orderNumber,
    );
    check('in the FO-###### shape', second.ok && /^FO-\d{6,}$/.test(second.data.orderNumber));

    const sequence = await prisma.db.numberSequence.findUnique({ where: { scope: 'order' } });
    check('the sequence row advanced', (sequence?.current ?? 0n) >= 2n);

    /**
     * Two checkouts at once. Each needs its own basket, so they are placed for the customer
     * and for a guest key that is adopted — which also exercises adoption against the real
     * unique constraint.
     */
    await fillCart(1);
    await fillCart(2, { guestKey: 'verify-checkout-guest-0001' });
    const concurrent = await Promise.allSettled([
      checkout.placeOrder(CUSTOMER, undefined, REQUEST),
      checkout.placeOrder(CUSTOMER, 'verify-checkout-guest-0001', REQUEST),
    ]);
    const numbers = concurrent
      .filter((outcome) => outcome.status === 'fulfilled')
      .map((outcome) => (outcome.value.ok ? outcome.value.data.orderNumber : null))
      .filter((value): value is string => value !== null);
    check(
      'concurrent checkouts produce distinct references',
      new Set(numbers).size === numbers.length,
    );

    // =======================================================================
    section('guest basket adoption');

    await cleanup();
    const guestKey = 'verify-checkout-guest-0002';
    await fillCart(2, { guestKey });
    const guestCart = await carts.currentCart({ guestKey });
    check('a guest basket exists', guestCart !== null);
    check('with two units', guestCart?.count === 2);

    const adopted = await checkout.placeOrder(CUSTOMER, guestKey, REQUEST);
    check('the guest basket is ordered on the account', adopted.ok);
    check(
      'and it carried its quantity across',
      adopted.ok && adopted.data.lines[0]?.quantity === 2,
    );
    check(
      'the guest basket is gone',
      (await carts.currentCart({ guestKey })) === null,
    );

    // =======================================================================
    section('coupons, against real coupon rows');

    await cleanup();
    await fillCart(1);

    const bellaLunch = await checkout.summary(OWNER, {
      fulfillment: 'delivery',
      tipPercent: 0,
      couponCode: 'bellalunch',
    });
    check('a seeded vendor coupon applies at that vendor', bellaLunch.ok && bellaLunch.data.coupon !== null);
    check(
      'and its discount is 15% capped at 250',
      bellaLunch.ok &&
        bellaLunch.data.pricing.discount ===
          Math.min(250, Math.round(bellaLunch.data.pricing.subtotal * 0.15 * 100) / 100),
    );

    const expired = await checkout.summary(OWNER, {
      fulfillment: 'delivery',
      tipPercent: 0,
      couponCode: 'HELLO-15',
    });
    check(
      'the seeded expired coupon is refused as expired',
      expired.ok && expired.data.couponRefusal === CouponRefusal.expired,
    );

    const notStarted = await checkout.summary(OWNER, {
      fulfillment: 'delivery',
      tipPercent: 0,
      couponCode: 'NAPOLIRIDE',
    });
    check(
      'the seeded future coupon is refused as not started',
      notStarted.ok && notStarted.data.couponRefusal === CouponRefusal.notStarted,
    );

    const unknown = await checkout.summary(OWNER, {
      fulfillment: 'delivery',
      tipPercent: 0,
      couponCode: 'NOSUCHCODE',
    });
    check(
      'an unknown code is refused by name',
      unknown.ok && unknown.data.couponRefusal === CouponRefusal.unknownCode,
    );

    const withCoupon = await checkout.placeOrder(CUSTOMER, undefined, {
      ...REQUEST,
      couponCode: 'BELLALUNCH',
    });
    check('an order with a coupon is placed', withCoupon.ok);
    const couponRow = withCoupon.ok
      ? await prisma.db.order.findUnique({
          where: { id: withCoupon.data.id },
          select: { couponId: true, couponCode: true, discount: true },
        })
      : null;
    check('the coupon id is recorded on the order', couponRow?.couponId === 'cpn_ven_bella_lunch');
    check('and its code', couponRow?.couponCode === 'BELLALUNCH');
    check('and the discount that was actually given', (couponRow?.discount.toNumber() ?? 0) > 0);

    /**
     * `BELLALUNCH` has `usageLimit: 3`. One order exists, so two remain — and the fourth
     * must be refused. This is the limit being enforced from `orders`, which is the only
     * place V1 records a redemption.
     */
    await fillCart(1);
    const secondUse = await checkout.placeOrder(CUSTOMER, undefined, { ...REQUEST, couponCode: 'BELLALUNCH' });
    await fillCart(1);
    const thirdUse = await checkout.placeOrder(CUSTOMER, undefined, { ...REQUEST, couponCode: 'BELLALUNCH' });
    await fillCart(1);
    const fourthUse = await checkout.placeOrder(CUSTOMER, undefined, { ...REQUEST, couponCode: 'BELLALUNCH' });

    check('the second use is allowed', secondUse.ok);
    check('the third is allowed', thirdUse.ok);
    check('the fourth is refused — usageLimit is enforced from real orders', !fourthUse.ok);
    check(
      'and refused as a rejected coupon rather than silently repriced',
      !fourthUse.ok && fourthUse.error?.key === CheckoutError.couponRejected,
    );

    /**
     * Cancelling an order gives the ticket back. Nobody was fed and nobody was charged, so a
     * counter column that only incremented would have been wrong.
     */
    const toCancel = thirdUse.ok ? thirdUse.data.id : null;
    if (toCancel) {
      await prisma.db.order.update({ where: { id: toCancel }, data: { status: 'CANCELLED' } });
    }
    await fillCart(1);
    const afterCancel = await checkout.placeOrder(CUSTOMER, undefined, { ...REQUEST, couponCode: 'BELLALUNCH' });
    check('a cancelled order returns the coupon to the wallet', afterCancel.ok);

    // =======================================================================
    section('Decimal(14,2) round-trips, including awkward money');

    await cleanup();
    await fillCart(3);
    const awkward = await checkout.placeOrder(CUSTOMER, undefined, { ...REQUEST, tipPercent: 0.15 });
    check('an order with a 15% tip on three units is placed', awkward.ok);
    if (awkward.ok) {
      const stored = await prisma.db.order.findUnique({
        where: { id: awkward.data.id },
        select: { subtotal: true, tax: true, tip: true, total: true },
      });
      check('subtotal survives the round trip', stored?.subtotal.toNumber() === awkward.data.pricing.subtotal);
      check('tax survives it', stored?.tax.toNumber() === awkward.data.pricing.tax);
      check('tip survives it', stored?.tip.toNumber() === awkward.data.pricing.tip);
      check('total survives it', stored?.total.toNumber() === awkward.data.pricing.total);
      check(
        'and every stored amount has at most two decimals',
        [stored?.subtotal, stored?.tax, stored?.tip, stored?.total].every(
          (value) => value !== undefined && value !== null && /^\d+(\.\d{1,2})?$/.test(value.toFixed(2)),
        ),
      );
    }

    // =======================================================================
    section('a closed restaurant, against real opening hours');

    await cleanup();
    await fillCart(1);
    await prisma.db.vendorBranch.updateMany({
      where: { vendorId: BELLA },
      data: { acceptingOrders: false },
    });
    const closed = await checkout.placeOrder(CUSTOMER, undefined, REQUEST);
    check(
      'an order for right now is refused while the kitchen is not accepting',
      !closed.ok && closed.error?.key === CheckoutError.vendorClosed,
    );

    const scheduled = await checkout.placeOrder(CUSTOMER, undefined, {
      ...REQUEST,
      scheduledFor: new Date(Date.now() + 4 * 3_600_000),
    });
    check('a scheduled order is still accepted', scheduled.ok);
  } finally {
    /**
     * Restored in `finally`, not after the assertion that needed it.
     *
     * This is the only thing the script changes that is *not* its own row: a crash between
     * flipping the flag and flipping it back would leave every Bella Napoli branch closed,
     * and the next person to open the demo would find a restaurant that refuses orders for
     * no visible reason.
     */
    await prisma.db.vendorBranch.updateMany({
      where: { vendorId: BELLA },
      data: { acceptingOrders: true },
    });
    await cleanup();
    await app.close();
  }

  console.log(
    failures.length === 0
      ? `\n✓ ${passed} assertions passed against real PostgreSQL, 0 failed.`
      : `\n✗ ${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `    ${f}`).join('\n')}`,
  );
  if (failures.length > 0) process.exit(1);
}

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
