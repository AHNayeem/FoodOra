/**
 * V1 Unit 2's live verification — the assertions that need real PostgreSQL.
 *
 *   cd database && bun run migrate:deploy
 *   cd backend  && bun run seed:reference && bun run seed:demo
 *   cd backend  && bun run verify:cart:live
 *
 * ## Why this is a separate script from `verify:cart`
 *
 * Because it proves different things, and the distinction is the point. `verify:cart`
 * tests decisions — pricing, option validation, the single-vendor rule — against in-memory
 * ports, in milliseconds, with a failure that names the rule. This script tests the four
 * behaviours that *only exist* once Postgres is underneath, and that no fake can honestly
 * simulate:
 *
 * 1. **The unique constraint on `(userId, vendorId)`** and the fact that a soft-deleted
 *    cart still occupies its slot. This is the one that bites in production: a customer
 *    who abandoned a basket at a restaurant and came back later hits a unique violation,
 *    and only that customer does. A `Map`-based fake cannot fail this way.
 * 2. **Reviving a tombstoned cart** — that `deletedAt: undefined` really does read through
 *    the soft-delete extension's filter, rather than merely looking like it should.
 * 3. **The SQL `increment`**, including under two concurrent adds, where read-modify-write
 *    silently loses one.
 * 4. **The cascade** from a cart to its items to their options, which is a foreign-key
 *    declaration and not code anyone can unit test.
 *
 * It runs through `CartService` — the real repository, the real extensions, the real
 * transaction manager — so what passes here is the production path and not a rehearsal
 * of it.
 *
 * It writes to the database and cleans up after itself. The owner ids are prefixed
 * `verify-` so a failed run leaves obviously disposable rows rather than something that
 * looks like a customer's basket.
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { CartService } from '../src/modules/cart/application/cart.service';
import { CartError, type CartOwner } from '../src/modules/cart/domain';
import { PrismaService } from '../src/infrastructure/prisma';

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

/** Seeded by `seed:demo`, and asserted to exist before anything else runs. */
const MARGHERITA = 'food_pizza-margherita';
const BELLA = 'ven_bella_napoli';

const GUEST: CartOwner = { guestKey: 'verify-cart-guest-000001' };
const GUEST_B: CartOwner = { guestKey: 'verify-cart-guest-000002' };
/** Seeded by `seed:demo`. The authenticated path needs a real `users` row for the FK. */
const CUSTOMER: CartOwner = { userId: 'usr_customer' };

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const carts = app.get(CartService);
  const prisma = app.get(PrismaService);

  /** Removes everything this script created, tombstones included. */
  const cleanup = async () => {
    const rows = await prisma.cart.findMany({
      where: {
        OR: [{ guestKey: { startsWith: 'verify-cart-guest-' } }, { userId: CUSTOMER.userId }],
        deletedAt: undefined,
      },
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return;
    await prisma.cartItemOption.deleteMany({ where: { cartItem: { cartId: { in: ids } } } });
    await prisma.cartItem.deleteMany({ where: { cartId: { in: ids } } });
    // `$executeRaw`, because `cart.deleteMany` is refused on a soft-deletable model — and
    // rightly so. A verification script cleaning up after itself is the one legitimate
    // caller of a hard delete on this table.
    // Quoted, because the columns are camelCase in Postgres: only tables carry an
    // `@@map`, so `guestKey` is `"guestKey"` and unquoted it folds to `guestkey`.
    await prisma.$executeRaw`
      DELETE FROM carts
      WHERE "guestKey" LIKE 'verify-cart-guest-%' OR "userId" = ${CUSTOMER.userId ?? ''}
    `;
  };

  try {
    await cleanup();

    // =======================================================================
    section('the seed is what this script assumes');

    const margherita = await prisma.foodItem.findUnique({
      where: { id: MARGHERITA },
      select: { id: true, price: true, vendorId: true, optionGroups: { select: { id: true, options: { select: { id: true, priceDelta: true } } } } },
    });
    check('the demo catalogue is seeded (bun run seed:demo)', margherita !== null);
    if (!margherita) throw new Error('seed:demo has not been run — nothing below can pass.');

    const sizeGroup = margherita.optionGroups[0];
    const large = sizeGroup?.options.find((option) => Number(option.priceDelta) > 0);
    check('Margherita has a priced option group to exercise', large !== undefined);
    if (!sizeGroup || !large) throw new Error('the seeded Margherita has no priced option.');

    const basePrice = Number(margherita.price);
    const delta = Number(large.priceDelta);

    // =======================================================================
    section('a real row, priced from real columns');

    const added = await carts.addItem(GUEST, { foodId: MARGHERITA, optionIds: [large.id], quantity: 2 }, false);
    check('an add against Postgres succeeds', added.ok);
    check(
      `unit price is the stored Decimal arithmetic: ${basePrice} + ${delta}`,
      added.ok && added.data.lines[0]?.unitPrice === basePrice + delta,
    );
    check(
      'Decimal columns arrive as numbers, not Decimal objects',
      added.ok && typeof added.data.lines[0]?.unitPrice === 'number',
    );
    check('quantity persisted', added.ok && added.data.lines[0]?.quantity === 2);
    check(
      'the option snapshot was written with the database’s name and delta',
      added.ok && added.data.lines[0]?.options[0]?.priceDelta === delta,
    );

    const cartId = added.ok ? added.data.id : '';
    check('the cart id carries its prefix', cartId.startsWith('crt_'));

    const storedOptions = await prisma.cartItemOption.count({
      where: { cartItem: { cartId } },
    });
    check('the option row really exists in cart_item_options', storedOptions === 1);

    // =======================================================================
    section('the SQL increment, not read-modify-write');

    const merged = await carts.addItem(GUEST, { foodId: MARGHERITA, optionIds: [large.id], quantity: 3 }, false);
    check('a merge lands on the same primary key', merged.ok && merged.data.lines.length === 1);
    check('…and the quantity is 2 + 3', merged.ok && merged.data.lines[0]?.quantity === 5);

    /**
     * Two adds with no `await` between them. Under read-modify-write one of the two reads
     * a stale quantity and the other's increment is lost, so the total would be 6 rather
     * than 7 — which is exactly the bug that is invisible until a customer double-taps.
     */
    await Promise.all([
      carts.addItem(GUEST, { foodId: MARGHERITA, optionIds: [large.id], quantity: 1 }, false),
      carts.addItem(GUEST, { foodId: MARGHERITA, optionIds: [large.id], quantity: 1 }, false),
    ]);
    const afterConcurrent = await carts.currentCart(GUEST);
    check(
      'two concurrent adds both land — 5 + 1 + 1 = 7, no lost update',
      afterConcurrent?.lines[0]?.quantity === 7,
    );

    // =======================================================================
    section('the unique constraint, and reviving a tombstone');

    const secondVendorDish = await prisma.foodItem.findFirst({
      where: { vendorId: { not: BELLA }, isAvailable: true, deletedAt: null },
      select: { id: true, vendorId: true },
    });
    check('the seed has a dish from a second vendor', secondVendorDish !== null);
    if (!secondVendorDish) throw new Error('need a second vendor to test the conflict.');

    const conflict = await carts.addItem(GUEST, { foodId: secondVendorDish.id, optionIds: [], quantity: 1 }, false);
    check(
      'a cross-vendor add is refused against the real database too',
      !conflict.ok && conflict.error.key === CartError.vendorConflict,
    );

    const switched = await carts.addItem(GUEST, { foodId: secondVendorDish.id, optionIds: [], quantity: 1 }, true);
    check('replaceExisting switches vendor', switched.ok && switched.data.vendor.id === secondVendorDish.vendorId);

    const tombstoned = await prisma.cart.findFirst({
      where: { id: cartId, deletedAt: undefined },
      select: { deletedAt: true, items: { select: { id: true } } },
    });
    check('the abandoned cart was tombstoned, not hard-deleted', tombstoned?.deletedAt !== null);
    check('…and its items were removed', tombstoned?.items.length === 0);

    /**
     * The assertion this whole script exists for. Coming back to the first vendor has to
     * revive `crt_…` — the row still holds the `(userId, vendorId)` slot — rather than
     * insert a second one, which Postgres would refuse for a signed-in user.
     */
    const returned = await carts.addItem(GUEST, { foodId: MARGHERITA, optionIds: [large.id], quantity: 1 }, true);
    check('returning to the first vendor succeeds', returned.ok);
    check(
      'the tombstoned cart was revived — same id, not a second row',
      returned.ok && returned.data.id === cartId,
    );
    check(
      'the revived basket does not resurrect what was abandoned',
      returned.ok && returned.data.lines.length === 1 && returned.data.lines[0]?.quantity === 1,
    );

    const rowsForGuest = await prisma.cart.findMany({
      where: { guestKey: GUEST.guestKey, deletedAt: undefined },
      select: { id: true, deletedAt: true },
    });
    check('exactly two cart rows exist for this guest — one per vendor', rowsForGuest.length === 2);
    check(
      'exactly one of them is live',
      rowsForGuest.filter((row) => row.deletedAt === null).length === 1,
    );

    // =======================================================================
    section('isolation between owners');

    /**
     * The regression this section exists for.
     *
     * Two guests add the *same configuration*, so both compute the identical line id
     * `food_pizza-margherita|marg_large`. Before the stored key was scoped by cart id,
     * the second guest's upsert found the first guest's row and incremented it: guest A's
     * basket grew to 2 and guest B's stayed empty. `cart_items.id` is a global primary key
     * and a line id is only unique within a basket — a distinction no in-memory fake has.
     */
    await carts.addItem(GUEST_B, { foodId: MARGHERITA, optionIds: [large.id], quantity: 1 }, false);
    const a = await carts.currentCart(GUEST);
    const b = await carts.currentCart(GUEST_B);

    check('two guests get two carts', a !== null && b !== null && a.id !== b.id);
    check(
      'the identical configuration did not land in the other guest’s basket',
      a?.count === 1 && b?.count === 1,
    );
    check(
      'both report the same *wire* line id — the cart prefix never reaches the client',
      a?.lines[0]?.id === b?.lines[0]?.id &&
        a?.lines[0]?.id === `${MARGHERITA}|${large.id}`,
    );
    check(
      'two rows exist in cart_items for that one configuration, one per cart',
      (await prisma.cartItem.count({ where: { foodId: MARGHERITA, cartId: { in: [a?.id ?? '', b?.id ?? ''] } } })) === 2,
    );

    const crossOwner = await carts.updateQuantity(GUEST_B, b?.lines[0]?.id ?? '', 9);
    check('guest B can update their own line', crossOwner.ok);
    check(
      '…and guest A’s identically-configured line is untouched',
      (await carts.currentCart(GUEST))?.lines[0]?.quantity === 1,
    );

    // =======================================================================
    section('quantity, removal and the cascade');

    /**
     * Found rather than hardcoded, and deliberately one with no option groups: several of
     * Bella Napoli's dishes have a *required* size group, so an empty selection is correctly
     * refused. A fixture that assumed otherwise would fail as a validation error and read
     * as a bug in the cart.
     */
    const plainDish = await prisma.foodItem.findFirst({
      where: { vendorId: BELLA, isAvailable: true, deletedAt: null, optionGroups: { none: {} } },
      select: { id: true },
    });
    check('the seed has an option-free dish at the same vendor', plainDish !== null);

    const second = await carts.addItem(GUEST, { foodId: plainDish?.id ?? '', optionIds: [], quantity: 1 }, false);
    check(
      'a second dish from the same vendor is a second line',
      second.ok && second.data.lines.length === 2,
    );

    const margheritaLine = `${MARGHERITA}|${large.id}`;
    const storedKey = `${a?.id ?? ''}#${margheritaLine}`;
    const optionsBefore = await prisma.cartItemOption.count({ where: { cartItemId: storedKey } });
    check('the line’s option row is there before the removal', optionsBefore === 1);

    const removed = await carts.removeItem(GUEST, margheritaLine);
    check('removing one line keeps the cart', removed.ok && removed.data !== null);
    check('…and only the other line remains', removed.ok && removed.data?.lines.length === 1);

    check(
      'deleting a cart item cascades to its options — no orphan rows',
      (await prisma.cartItemOption.count({ where: { cartItemId: storedKey } })) === 0,
    );

    const cleared = await carts.clearCart(GUEST);
    check('clearing succeeds', cleared.ok);
    check('…and the cart reads as gone', (await carts.currentCart(GUEST)) === null);

    const itemsLeft = await prisma.cartItem.count({ where: { cartId } });
    check('no cart items survive the clear', itemsLeft === 0);

    // =======================================================================
    section('the authenticated owner — where the unique constraint actually applies');

    /**
     * This section exists because the guest tests above do **not** exercise
     * `@@unique([userId, vendorId])` at all. A guest cart has `userId IS NULL`, and Postgres
     * treats NULLs as distinct, so the constraint permits any number of guest rows for one
     * vendor. Only a signed-in owner can collide — which means the revive-a-tombstone path,
     * the one thing most likely to break in production, was previously verified against a
     * constraint that was not in force.
     *
     * It goes through `CartService` rather than the `login` mutation deliberately: `login`
     * currently throws (`setAuthCookies` receives an undefined Fastify reply — a Unit 0
     * defect outside this unit's scope), and the cart's ownership rules should not be
     * unverifiable because a neighbouring module has a bug.
     */
    const authed = await carts.addItem(CUSTOMER, { foodId: MARGHERITA, optionIds: [large.id], quantity: 1 }, false);
    check('an authenticated add succeeds', authed.ok);

    const authedCartId = authed.ok ? authed.data.id : '';
    const authedRow = await prisma.cart.findUnique({
      where: { id: authedCartId },
      select: { userId: true, guestKey: true },
    });
    check('the row is keyed by userId', authedRow?.userId === CUSTOMER.userId);
    check('…and carries no guest key', authedRow?.guestKey === null);

    const authedConflict = await carts.addItem(CUSTOMER, { foodId: secondVendorDish.id, optionIds: [], quantity: 1 }, true);
    check('switching vendor tombstones the first cart', authedConflict.ok);

    /**
     * The assertion. `carts` now holds a tombstoned `(usr_customer, ven_bella_napoli)` row,
     * so inserting a second one is a unique violation — and unlike the guest case, Postgres
     * really will refuse it. Passing proves `openCart` revived rather than inserted.
     */
    const authedReturn = await carts.addItem(CUSTOMER, { foodId: MARGHERITA, optionIds: [large.id], quantity: 1 }, true);
    check(
      'returning to the first vendor does not violate the unique constraint',
      authedReturn.ok,
    );
    check(
      '…because the tombstoned row was revived, not duplicated',
      authedReturn.ok && authedReturn.data.id === authedCartId,
    );
    check(
      'exactly one (userId, vendorId) row exists for that pair',
      (await prisma.cart.count({
        where: { userId: CUSTOMER.userId, vendorId: BELLA, deletedAt: undefined },
      })) === 1,
    );

    check(
      'a guest cannot see the authenticated basket',
      (await carts.currentCart({ guestKey: 'verify-cart-guest-000009' })) === null,
    );

    await carts.clearCart(CUSTOMER);
    check('the authenticated cart clears', (await carts.currentCart(CUSTOMER)) === null);

    // =======================================================================
    section('expiry is stamped');

    const fresh = await carts.addItem(GUEST, { foodId: MARGHERITA, optionIds: [large.id], quantity: 1 }, true);
    const expiring = fresh.ok
      ? await prisma.cart.findUnique({ where: { id: fresh.data.id }, select: { expiresAt: true } })
      : null;
    check(
      'a written cart carries an expiresAt in the future (CART_TTL_HOURS)',
      expiring?.expiresAt !== null && (expiring?.expiresAt?.getTime() ?? 0) > Date.now(),
    );
  } finally {
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

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
