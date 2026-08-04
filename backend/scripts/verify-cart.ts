/**
 * V1 Unit 2's offline verification harness.
 *
 *   bun run verify:cart
 *
 * ## What this proves, and what `verify:cart:live` proves instead
 *
 * Unlike Unit 1, this unit *does* have a database to test against — so the split between
 * the two harnesses is a deliberate division of labour rather than a limitation:
 *
 * - **Here:** the pure decisions. Line identity, option validation, pricing arithmetic,
 *   and the service's orchestration — vendor conflict, quantity bounds, the cart cap, the
 *   collapse of "quantity zero" into a removal — exercised through the *real*
 *   `CartService` against in-memory ports. These are the rules a customer can trip with a
 *   click, and every one of them produces a plausible-looking wrong answer when it breaks:
 *   a line that stops merging, a basket priced from a stale tab, two vendors in one
 *   delivery.
 * - **`scripts/verify-cart-live.ts`:** the parts that are *only* true in Postgres —
 *   the unique constraint on `(userId, vendorId)`, reviving a tombstoned cart, the SQL
 *   `increment`, the cascade from a cart to its items and options.
 *
 * A rule tested here is tested in milliseconds and in isolation. A rule tested there
 * needs a migrated database and tells you nothing about *why* it failed. Both are worth
 * having; conflating them is how a suite becomes slow and vague at the same time.
 */
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/foodora';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.OTP_PEPPER ??= 'harness-pepper';

import { CartService } from '../src/modules/cart/application/cart.service';
import {
  cartCount,
  CartError,
  type CartLineRecord,
  type CartOwner,
  type CartRepositoryPort,
  type CartState,
  type CartVendorRecord,
  cartSubtotal,
  deliveryFeeFor,
  lineIdFits,
  lineUnitPrice,
  makeLineId,
  MAX_LINE_ID_LENGTH,
  money,
  resolveSelection,
  storedLineId,
  toWireLineId,
} from '../src/modules/cart/domain';
import type {
  CatalogReaderPort,
  FoodItemRecord,
  FoodOptionGroupRecord,
  VendorRecord,
} from '../src/modules/catalog/domain';
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

const AUDIT = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
};

const group = (over: Partial<FoodOptionGroupRecord> = {}): FoodOptionGroupRecord => ({
  id: 'grp_size',
  name: 'Size',
  required: true,
  min: 1,
  max: 1,
  options: [
    { id: 'opt_regular', name: 'Regular', priceDelta: 0 },
    { id: 'opt_large', name: 'Large', priceDelta: 120 },
  ],
  ...over,
});

const food = (over: Partial<FoodItemRecord> = {}): FoodItemRecord => ({
  ...AUDIT,
  id: 'food_margherita',
  slug: 'pizza-margherita',
  vendorId: 'ven_bella',
  sectionId: 'sec_pizzas',
  name: 'Margherita DOP',
  description: 'San Marzano, fior di latte',
  image: 'https://example.test/margherita.jpg',
  price: 720,
  compareAtPrice: null,
  dietary: ['vegetarian'],
  spicyLevel: 0,
  calories: null,
  rating: 4.8,
  reviewCount: 120,
  isPopular: true,
  isAvailable: true,
  optionGroups: [group()],
  ...over,
});

const vendorRecord = (over: Partial<VendorRecord> = {}): VendorRecord => ({
  ...AUDIT,
  id: 'ven_bella',
  slug: 'bella-napoli',
  type: 'restaurant',
  ownerId: null,
  name: 'Bella Napoli',
  tagline: 'Wood-fired pizza',
  description: '',
  logo: '',
  cover: '',
  cuisineIds: ['cus_italian'],
  dietary: [],
  priceLevel: 3,
  rating: 4.8,
  reviewCount: 120,
  location: { lat: 23.78, lng: 90.41, address: '', city: 'Dhaka', countryCode: 'BD' },
  distanceKm: 0,
  etaMinutes: [25, 35],
  deliveryFee: 60,
  minOrder: 300,
  freeDeliveryOver: 800,
  hours: {} as VendorRecord['hours'],
  isOpen: true,
  isFeatured: false,
  isTrending: false,
  promoLabel: null,
  currency: 'BDT',
  ...over,
});

const snapshot = (over: Partial<CartVendorRecord> = {}): CartVendorRecord => ({
  id: 'ven_bella',
  slug: 'bella-napoli',
  name: 'Bella Napoli',
  currency: 'BDT',
  countryCode: 'BD',
  deliveryFee: 60,
  minOrder: 300,
  freeDeliveryOver: 800,
  ...over,
});

const line = (over: Partial<CartLineRecord> = {}): CartLineRecord => ({
  id: 'food_margherita|opt_large',
  foodId: 'food_margherita',
  name: 'Margherita DOP',
  image: '',
  basePrice: 720,
  unitPrice: 840,
  quantity: 1,
  options: [{ groupId: 'grp_size', optionId: 'opt_large', name: 'Large', priceDelta: 120 }],
  ...over,
});

// ---------------------------------------------------------------------------
// In-memory ports
// ---------------------------------------------------------------------------

/**
 * A cart store in a Map, honouring the one invariant the real repository exists to keep:
 * an owner has at most one live cart, and `openCart` is what makes that true.
 */
class FakeCartRepository implements CartRepositoryPort {
  private carts = new Map<string, CartState & { ownerKey: string; deleted: boolean }>();
  private sequence = 0;

  constructor(private readonly vendors: CartVendorRecord[] = [snapshot()]) {}

  private key(owner: CartOwner): string {
    return owner.userId ? `u:${owner.userId}` : `g:${owner.guestKey}`;
  }

  async findLive(owner: CartOwner): Promise<CartState | null> {
    const ownerKey = this.key(owner);
    for (const cart of this.carts.values()) {
      if (cart.ownerKey === ownerKey && !cart.deleted) {
        return { id: cart.id, vendorId: cart.vendorId, lines: cart.lines, updatedAt: cart.updatedAt };
      }
    }
    return null;
  }

  async openCart(owner: CartOwner, vendorId: string): Promise<CartState> {
    const ownerKey = this.key(owner);
    const live = await this.findLive(owner);

    if (live && live.vendorId === vendorId) return live;
    if (live) {
      const existing = this.carts.get(live.id);
      if (existing) {
        existing.deleted = true;
        existing.lines = [];
      }
    }

    // Revival: an owner returning to a vendor they abandoned reuses the row, emptied.
    for (const cart of this.carts.values()) {
      if (cart.ownerKey === ownerKey && cart.vendorId === vendorId) {
        cart.deleted = false;
        cart.lines = [];
        return { id: cart.id, vendorId, lines: [], updatedAt: cart.updatedAt };
      }
    }

    this.sequence += 1;
    const id = `crt_${this.sequence}`;
    this.carts.set(id, {
      id,
      ownerKey,
      vendorId,
      lines: [],
      updatedAt: AUDIT.updatedAt,
      deleted: false,
    });
    return { id, vendorId, lines: [], updatedAt: AUDIT.updatedAt };
  }

  async addQuantity(cartId: string, incoming: CartLineRecord): Promise<void> {
    const cart = this.carts.get(cartId);
    if (!cart) return;
    const existing = cart.lines.find((row) => row.id === incoming.id);
    if (existing) existing.quantity += incoming.quantity;
    else cart.lines.push({ ...incoming });
  }

  async setQuantity(cartId: string, lineId: string, quantity: number): Promise<boolean> {
    const cart = this.carts.get(cartId);
    const target = cart?.lines.find((row) => row.id === lineId);
    if (!target) return false;
    target.quantity = quantity;
    return true;
  }

  async removeLine(cartId: string, lineId: string): Promise<boolean> {
    const cart = this.carts.get(cartId);
    if (!cart) return false;
    const before = cart.lines.length;
    cart.lines = cart.lines.filter((row) => row.id !== lineId);
    return cart.lines.length !== before;
  }

  async clear(cartId: string): Promise<void> {
    const cart = this.carts.get(cartId);
    if (!cart) return;
    cart.lines = [];
    cart.deleted = true;
  }

  async loadVendorSnapshot(vendorId: string): Promise<CartVendorRecord | null> {
    return this.vendors.find((row) => row.id === vendorId) ?? null;
  }

  /** Test-only: how many rows exist, tombstones included. */
  get rowCount(): number {
    return this.carts.size;
  }
}

class FakeCatalogReader implements CatalogReaderPort {
  constructor(
    private readonly foods: FoodItemRecord[],
    private readonly vendors: VendorRecord[] = [vendorRecord()],
  ) {}

  async findVendorById(vendorId: string): Promise<VendorRecord | null> {
    return this.vendors.find((row) => row.id === vendorId) ?? null;
  }

  async findFoodById(foodId: string): Promise<FoodItemRecord | null> {
    return this.foods.find((row) => row.id === foodId) ?? null;
  }
}

/** No transaction to join — the point is that the service does not know that. */
const passthroughUow: UnitOfWorkPort = { runInTransaction: (fn) => fn() };

const CART_LIMITS = { maxLines: 3, maxLineQuantity: 20, ttlHours: 72 };

function makeService(
  foods: FoodItemRecord[],
  vendors: CartVendorRecord[] = [snapshot()],
): { service: CartService; repository: FakeCartRepository } {
  const repository = new FakeCartRepository(vendors);
  const service = new CartService(
    repository,
    new FakeCatalogReader(foods),
    passthroughUow,
    CART_LIMITS,
  );
  return { service, repository };
}

const GUEST: CartOwner = { guestKey: 'guest-0123456789abcdef' };
const USER: CartOwner = { userId: 'usr_customer' };

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // =========================================================================
  section('line identity — two identical dinners must be one line');

  check(
    'the id is the food plus its sorted options, joined by a pipe',
    makeLineId('food_x', ['b', 'a']) === 'food_x|a|b',
  );
  check(
    'option order does not matter — the same choices are the same line',
    makeLineId('food_x', ['a', 'b']) === makeLineId('food_x', ['b', 'a']),
  );
  check(
    'a different option set is a different line',
    makeLineId('food_x', ['a']) !== makeLineId('food_x', ['a', 'b']),
  );
  check('no options is just the food id', makeLineId('food_x', []) === 'food_x');
  check(
    'the caller’s array is not mutated by the sort',
    (() => {
      const ids = ['b', 'a'];
      makeLineId('food_x', ids);
      return ids[0] === 'b';
    })(),
  );
  check(
    'this is byte-for-byte frontend/lib/cart.ts::makeLineId',
    makeLineId('food_margherita', ['opt_large', 'grp_extra']) ===
      ['food_margherita', ...['opt_large', 'grp_extra'].sort()].join('|'),
  );
  const CART = 'crt_01KZ5ES878H1K9XCHJG98JE6CH';
  check(
    'the stored key is scoped by the cart, so two baskets cannot collide on one primary key',
    storedLineId(CART, 'food_x|opt_a') === `${CART}#food_x|opt_a`,
  );
  check(
    'the wire id is recovered exactly — the frontend never sees the prefix',
    toWireLineId(CART, storedLineId(CART, 'food_x|opt_a')) === 'food_x|opt_a',
  );
  check(
    'an unprefixed id is passed through rather than mangled',
    toWireLineId(CART, 'food_x|opt_a') === 'food_x|opt_a',
  );
  check(
    `a line whose stored key fits ${MAX_LINE_ID_LENGTH} characters is accepted`,
    lineIdFits(CART, 'x'.repeat(MAX_LINE_ID_LENGTH - CART.length - 1)),
  );
  check(
    'one character more does not',
    !lineIdFits(CART, 'x'.repeat(MAX_LINE_ID_LENGTH - CART.length)),
  );

  // =========================================================================
  section('pricing — the server’s arithmetic, not the client’s');

  check('no options means the base price', lineUnitPrice(720, []) === 720);
  check(
    'each delta is added',
    lineUnitPrice(720, [
      { groupId: 'g', optionId: 'a', name: 'Large', priceDelta: 120 },
      { groupId: 'g2', optionId: 'b', name: 'Extra cheese', priceDelta: 80 },
    ]) === 920,
  );
  check(
    'a negative delta is a discount, not an error',
    lineUnitPrice(720, [{ groupId: 'g', optionId: 'a', name: 'Small', priceDelta: -100 }]) === 620,
  );
  check('float dust does not survive: 0.1 + 0.2 is 0.3', money(0.1 + 0.2) === 0.3);
  check(
    'a unit price is rounded to two places, not left as a double',
    lineUnitPrice(10.1, [{ groupId: 'g', optionId: 'a', name: 'x', priceDelta: 0.2 }]) === 10.3,
  );
  check(
    'the subtotal multiplies before it sums',
    cartSubtotal([line({ quantity: 3 })]) === 2520,
  );
  check('an empty cart subtotals to zero', cartSubtotal([]) === 0);
  check(
    'the count is units, not lines',
    cartCount([line({ quantity: 3 }), line({ id: 'other', quantity: 2 })]) === 5,
  );
  check(
    'below the threshold the delivery fee stands',
    deliveryFeeFor(snapshot(), 799) === 60,
  );
  check(
    'at the threshold exactly, delivery is free — ">= 800", not "> 800"',
    deliveryFeeFor(snapshot(), 800) === 0,
  );
  check('above it, still free', deliveryFeeFor(snapshot(), 1200) === 0);
  check(
    'a vendor with no threshold always charges',
    deliveryFeeFor(snapshot({ freeDeliveryOver: null }), 99_999) === 60,
  );

  // =========================================================================
  section('variant and add-on selection');

  const sized = food();

  check(
    'a required single-choice group accepts exactly one',
    resolveSelection(sized, ['opt_large']).ok,
  );
  check(
    'the resolved option carries the database’s name and price, not the client’s',
    (() => {
      const result = resolveSelection(sized, ['opt_large']);
      return result.ok && result.options[0]?.name === 'Large' && result.options[0]?.priceDelta === 120;
    })(),
  );
  check(
    'a required group with nothing chosen is refused',
    (() => {
      const result = resolveSelection(sized, []);
      return !result.ok && result.failure.key === CartError.optionGroupRequired;
    })(),
  );
  check(
    'two choices in a max-1 group are refused',
    (() => {
      const result = resolveSelection(sized, ['opt_regular', 'opt_large']);
      return !result.ok && result.failure.key === CartError.tooManyOptions;
    })(),
  );
  check(
    'an option id from another dish is refused rather than ignored',
    (() => {
      const result = resolveSelection(sized, ['opt_large', 'opt_from_elsewhere']);
      return !result.ok && result.failure.key === CartError.unknownOption;
    })(),
  );
  check(
    'the same option twice is refused',
    (() => {
      const result = resolveSelection(sized, ['opt_large', 'opt_large']);
      return !result.ok && result.failure.key === CartError.duplicateOption;
    })(),
  );

  const withAddons = food({
    optionGroups: [
      group(),
      group({
        id: 'grp_extras',
        name: 'Extras',
        required: false,
        min: 0,
        max: 2,
        options: [
          { id: 'opt_cheese', name: 'Extra cheese', priceDelta: 80 },
          { id: 'opt_basil', name: 'Fresh basil', priceDelta: 40 },
          { id: 'opt_chilli', name: 'Chilli oil', priceDelta: 30 },
        ],
      }),
    ],
  });

  check(
    'an optional group may be skipped entirely',
    resolveSelection(withAddons, ['opt_regular']).ok,
  );
  check(
    'an optional group accepts up to its maximum',
    resolveSelection(withAddons, ['opt_regular', 'opt_cheese', 'opt_basil']).ok,
  );
  check(
    'one past the maximum is refused',
    (() => {
      const result = resolveSelection(withAddons, [
        'opt_regular',
        'opt_cheese',
        'opt_basil',
        'opt_chilli',
      ]);
      return !result.ok && result.failure.key === CartError.tooManyOptions;
    })(),
  );
  check(
    'options come back in menu order, whatever order they were sent in',
    (() => {
      const result = resolveSelection(withAddons, ['opt_basil', 'opt_cheese', 'opt_regular']);
      return (
        result.ok &&
        result.options.map((option) => option.optionId).join(',') ===
          'opt_regular,opt_cheese,opt_basil'
      );
    })(),
  );
  check(
    'menu order makes the line id independent of click order',
    (() => {
      const a = resolveSelection(withAddons, ['opt_basil', 'opt_regular']);
      const b = resolveSelection(withAddons, ['opt_regular', 'opt_basil']);
      if (!a.ok || !b.ok) return false;
      return (
        makeLineId('food_margherita', a.options.map((o) => o.optionId)) ===
        makeLineId('food_margherita', b.options.map((o) => o.optionId))
      );
    })(),
  );
  check(
    'a dish with no option groups takes no options',
    (() => {
      const plain = food({ id: 'food_bruschetta', optionGroups: [] });
      return resolveSelection(plain, []).ok && !resolveSelection(plain, ['anything']).ok;
    })(),
  );

  // =========================================================================
  section('the cart, through the real CartService');

  {
    const { service } = makeService([food()]);

    const added = await service.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 1 }, false);
    check('an add succeeds and returns the cart', added.ok);
    check(
      'the line is priced from the database: 720 + 120',
      added.ok && added.data.lines[0]?.unitPrice === 840,
    );
    check(
      'the line id is the composite, computed server-side',
      added.ok && added.data.lines[0]?.id === 'food_margherita|opt_large',
    );
    check('the cart carries the vendor snapshot', added.ok && added.data.vendor.slug === 'bella-napoli');
    check('subtotal and count are returned', added.ok && added.data.subtotal === 840 && added.data.count === 1);
    check(
      'one large Margherita is 840, which already clears the ৳800 threshold — delivery is free',
      added.ok && added.data.deliveryFee === 0,
    );

    const again = await service.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 2 }, false);
    check('adding the same configuration merges into one line', again.ok && again.data.lines.length === 1);
    check('…and sums the quantity', again.ok && again.data.lines[0]?.quantity === 3);
    check(
      'the subtotal follows: 840 × 3',
      again.ok && again.data.subtotal === 2520,
    );
    check(
      'crossing the free-delivery threshold drops the fee to zero',
      again.ok && again.data.deliveryFee === 0,
    );

    const different = await service.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_regular'], quantity: 1 }, false);
    check('a different configuration is a second line', different.ok && different.data.lines.length === 2);
  }

  {
    // A basket that stays under the free-delivery threshold, so the fee is exercised
    // through the service and not only through the pure function.
    const { service } = makeService([food({ id: 'food_bruschetta', price: 320, optionGroups: [] })]);
    const cheap = await service.addItem(GUEST, { foodId: 'food_bruschetta', optionIds: [], quantity: 1 }, false);
    check(
      'below the threshold the vendor’s delivery fee is charged',
      cheap.ok && cheap.data.subtotal === 320 && cheap.data.deliveryFee === 60,
    );
  }

  {
    const { service } = makeService([food()]);
    check(
      'an unknown dish is refused',
      await refusedWith(service.addItem(GUEST, { foodId: 'food_nope', optionIds: [], quantity: 1 }, false), CartError.foodNotFound),
    );
    check(
      'a sold-out dish is refused',
      await (async () => {
        const { service: s } = makeService([food({ isAvailable: false })]);
        return refusedWith(s.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 1 }, false), CartError.itemUnavailable);
      })(),
    );
    check(
      'quantity zero on an add is refused — an add of nothing is a mistake, not a removal',
      await refusedWith(service.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 0 }, false), CartError.invalidQuantity),
    );
    check(
      'a quantity above CART_MAX_LINE_QUANTITY is refused',
      await refusedWith(service.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 21 }, false), CartError.invalidQuantity),
    );
    check(
      'a fractional quantity is refused',
      await refusedWith(service.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 1.5 }, false), CartError.invalidQuantity),
    );
    check(
      'a merge that would exceed the per-line ceiling is refused',
      await (async () => {
        const { service: s } = makeService([food()]);
        await s.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 19 }, false);
        return refusedWith(s.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 5 }, false), CartError.invalidQuantity);
      })(),
    );
  }

  // --- the single-vendor rule ------------------------------------------------
  {
    const bella = food();
    const burger = food({
      id: 'food_smash',
      slug: 'smash-burger',
      vendorId: 'ven_burger',
      name: 'Double Smash',
      price: 540,
      optionGroups: [],
    });

    const { service, repository } = makeService(
      [bella, burger],
      [snapshot(), snapshot({ id: 'ven_burger', slug: 'burger-lab', name: 'Burger Lab' })],
    );

    await service.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 1 }, false);

    const conflict = await service.addItem(GUEST, { foodId: 'food_smash', optionIds: [], quantity: 1 }, false);
    check(
      'a dish from another vendor is refused rather than mixed in',
      !conflict.ok && conflict.error.key === CartError.vendorConflict,
    );
    check(
      'the refusal names both vendors so the prompt needs no second round trip',
      !conflict.ok &&
        conflict.error.params?.currentVendorId === 'ven_bella' &&
        conflict.error.params?.requestedVendorId === 'ven_burger',
    );

    const stillBella = await service.currentCart(GUEST);
    check(
      'the refused add left the original basket untouched',
      stillBella?.vendor.id === 'ven_bella' && stillBella.lines.length === 1,
    );

    const replaced = await service.addItem(GUEST, { foodId: 'food_smash', optionIds: [], quantity: 1 }, true);
    check('replaceExisting switches vendor', replaced.ok && replaced.data.vendor.id === 'ven_burger');
    check(
      'the old vendor’s lines do not come along',
      replaced.ok && replaced.data.lines.length === 1 && replaced.data.lines[0]?.foodId === 'food_smash',
    );

    const backAgain = await service.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 1 }, true);
    check('switching back works', backAgain.ok && backAgain.data.vendor.id === 'ven_bella');
    check(
      'the revived cart is empty of what was abandoned — a basket is not restored, it is reopened',
      backAgain.ok && backAgain.data.lines.length === 1,
    );
    check(
      'returning to a vendor reuses its row rather than inserting a second one',
      repository.rowCount === 2,
    );
  }

  // --- the cart cap ---------------------------------------------------------
  {
    const dishes = [1, 2, 3, 4].map((n) =>
      food({ id: `food_${n}`, slug: `dish-${n}`, name: `Dish ${n}`, optionGroups: [] }),
    );
    const { service } = makeService(dishes);

    for (const dish of dishes.slice(0, 3)) {
      await service.addItem(GUEST, { foodId: dish.id, optionIds: [], quantity: 1 }, false);
    }
    check(
      `a fourth distinct line is refused at maxLines = ${CART_LIMITS.maxLines}`,
      await refusedWith(service.addItem(GUEST, { foodId: 'food_4', optionIds: [], quantity: 1 }, false), CartError.cartFull),
    );
    check(
      'a full cart can still have an existing line’s quantity raised — the cap counts configurations',
      (await service.addItem(GUEST, { foodId: 'food_1', optionIds: [], quantity: 1 }, false)).ok,
    );
  }

  // --- quantity, removal, clearing ------------------------------------------
  {
    const { service } = makeService([food()]);
    await service.addItem(USER, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 2 }, false);

    const raised = await service.updateQuantity(USER, 'food_margherita|opt_large', 5);
    check('a quantity update takes effect', raised.ok && raised.data?.lines[0]?.quantity === 5);
    check('…and the subtotal follows', raised.ok && raised.data?.subtotal === 4200);

    check(
      'an unknown line id is refused',
      await refusedWith(service.updateQuantity(USER, 'food_nope', 2), CartError.lineNotFound),
    );
    check(
      'a negative quantity is refused',
      await refusedWith(service.updateQuantity(USER, 'food_margherita|opt_large', -1), CartError.invalidQuantity),
    );

    const zeroed = await service.updateQuantity(USER, 'food_margherita|opt_large', 0);
    check(
      'quantity zero removes the line — the stepper reaching the bottom is a removal',
      zeroed.ok && zeroed.data === null,
    );
    check(
      'removing the last line leaves no cart, not an empty one pinned to a vendor',
      (await service.currentCart(USER)) === null,
    );
  }

  {
    const { service } = makeService([
      food(),
      food({ id: 'food_diavola', slug: 'pizza-diavola', name: 'Diavola', optionGroups: [] }),
    ]);
    await service.addItem(USER, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 1 }, false);
    await service.addItem(USER, { foodId: 'food_diavola', optionIds: [], quantity: 1 }, false);

    const removed = await service.removeItem(USER, 'food_margherita|opt_large');
    check(
      'removing one of two lines keeps the cart',
      removed.ok && removed.data?.lines.length === 1,
    );
    check(
      '…and reprices it',
      removed.ok && removed.data?.subtotal === 720,
    );

    const cleared = await service.clearCart(USER);
    check('clearing succeeds', cleared.ok);
    check('…and the cart is gone', (await service.currentCart(USER)) === null);
    check('clearing again is idempotent, not a refusal', (await service.clearCart(USER)).ok);
  }

  // --- ownership ------------------------------------------------------------
  {
    const { service } = makeService([food()]);
    await service.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 1 }, false);

    check(
      'a different guest key sees a different cart',
      (await service.currentCart({ guestKey: 'guest-fedcba9876543210' })) === null,
    );
    check(
      'a signed-in user does not see a guest’s cart',
      (await service.currentCart({ userId: 'usr_someone' })) === null,
    );
    check(
      'the guest still sees their own',
      (await service.currentCart(GUEST))?.lines.length === 1,
    );

    // An authenticated owner is keyed on the user id *alone* — this is what makes the
    // same account's cart visible from a second browser, which has a different key.
    await service.addItem(
      { userId: 'usr_customer', guestKey: 'guest-0123456789abcdef' },
      { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 1 },
      false,
    );
    check(
      'an authenticated request ignores the guest key it carries',
      (await service.currentCart({ userId: 'usr_customer', guestKey: 'guest-totally-different' }))
        ?.lines.length === 1,
    );
  }

  // --- the vendor disappearing underneath a basket --------------------------
  {
    const { service } = makeService([food()], []);
    check(
      'a dish whose vendor is no longer listable cannot be added',
      await refusedWith(
        service.addItem(GUEST, { foodId: 'food_margherita', optionIds: ['opt_large'], quantity: 1 }, false),
        CartError.vendorUnavailable,
      ),
    );
  }

  // =========================================================================
  console.log(
    failures.length === 0
      ? `\n✓ ${passed} assertions passed, 0 failed.`
      : `\n✗ ${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `    ${f}`).join('\n')}`,
  );
  if (failures.length > 0) process.exit(1);
}

/** Reads better at the call site than unwrapping a Result inline six times. */
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
