/**
 * repository.js — every basket statement, and no rule about any of them.
 *
 * The split modules 2–5 keep: Prisma's vocabulary here, the product's in
 * `service.js`. A `where`, a `select` and the enum translation on the way in are
 * this file's business; who owns a basket, what a line costs and whether a dish
 * may go in are not.
 *
 * ## Four things this file has to remember for the whole module
 *
 *  - **`Cart` is soft-deleted; `CartItem` and `CartItemOption` are not.**
 *    `plugins/prisma.js` therefore filters every cart read to `deletedAt IS NULL`
 *    and refuses `cart.delete()`, while a line genuinely leaves the database when
 *    it is removed. That asymmetry is the schema's — `carts` has the column and
 *    `cart_items` does not — and it is what makes "discard this basket" a
 *    tombstone plus a hard delete of its lines.
 *  - **A tombstone still occupies its unique slot.** `@@unique([userId, vendorId])`
 *    does not know about `deletedAt`, so a customer returning to a restaurant they
 *    abandoned must **revive** their old row, not insert a second one. Finding it
 *    needs `$unfiltered` — the extension would filter the very row we are looking
 *    for. Getting this wrong produces a unique violation that only ever appears
 *    for customers who came back, which is the worst possible test gap.
 *  - **Nested relations are not soft-delete filtered.** Same rule module 5 states:
 *    the query extension sees the top-level model only, so every nested select of
 *    a soft-deletable relation below carries its own `deletedAt: null`. Here a
 *    leaked row would also be a *priced* leak — a deleted option a customer could
 *    still put in a basket.
 *  - **Quantity moves by `increment`, never by read-then-write.** Two adds of the
 *    same configuration arriving together must sum. A read, a `+1` in JavaScript
 *    and a write loses one of them; a single guarded `UPDATE` cannot. This is the
 *    cart's version of the race `menu/repository.js::adjustStock` describes.
 */
import { toDbEnum } from "../../shared/utils/enums.js";

/** A `CartItemOption` — the snapshot of one chosen modifier. */
const OPTION_SELECT = Object.freeze({
  groupId: true,
  optionId: true,
  name: true,
  priceDelta: true,
});

/** A `CartItem` with its chosen options, ordered so a line renders identically twice. */
const ITEM_SELECT = Object.freeze({
  id: true,
  cartId: true,
  foodId: true,
  name: true,
  image: true,
  basePrice: true,
  unitPrice: true,
  quantity: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  options: { select: OPTION_SELECT, orderBy: [{ optionId: "asc" }] },
});

/**
 * A `Cart` with everything a read model needs.
 *
 * The vendor and its primary branch travel with it because `types/cart.ts::
 * CartVendor` is a snapshot the client holds beside the lines — the drawer shows
 * the restaurant's name without a second request, and checkout is handed the
 * terms it will price against. They are *read*, never stored on the cart: a
 * storefront that changed its delivery fee has changed it, and a copy on the
 * basket would be a second truth nobody updates.
 */
const CART_SELECT = Object.freeze({
  id: true,
  userId: true,
  guestKey: true,
  vendorId: true,
  branchId: true,
  currency: true,
  fulfillment: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  version: true,
  items: { select: ITEM_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  vendor: {
    select: {
      id: true,
      slug: true,
      name: true,
      currency: true,
      status: true,
      branches: {
        where: { isPrimary: true, deletedAt: null },
        take: 1,
        select: {
          id: true,
          lat: true,
          lng: true,
          address: true,
          countryCode: true,
          timezone: true,
          deliveryFee: true,
          minOrder: true,
          freeDeliveryOver: true,
        },
      },
    },
  },
});

/**
 * Everything adding one dish needs, in one statement.
 *
 * The joins are the module-5 read model seen from the cart's side: the dish, the
 * section and menu that decide whether it is on the board at all, the inventory
 * row behind `available = onHand − reserved`, its modifier groups with their live
 * options, and the storefront the basket would belong to. One query, because
 * every one of these is needed to answer a single "may this go in?" and a
 * sequence of them is a sequence of chances to read a half-changed menu.
 */
const FOOD_SELECT = Object.freeze({
  id: true,
  vendorId: true,
  sectionId: true,
  name: true,
  image: true,
  price: true,
  isAvailable: true,
  deletedAt: true,
  section: {
    select: {
      id: true,
      isActive: true,
      deletedAt: true,
      menu: { select: { id: true, kind: true, isActive: true, deletedAt: true } },
    },
  },
  inventory: {
    where: { deletedAt: null },
    select: { id: true, trackStock: true, onHand: true, reserved: true, lowStockAt: true },
  },
  optionGroups: {
    where: { deletedAt: null },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    select: {
      id: true,
      foodId: true,
      name: true,
      required: true,
      min: true,
      max: true,
      options: {
        where: { deletedAt: null },
        orderBy: [{ sort: "asc" }, { id: "asc" }],
        select: { id: true, groupId: true, name: true, priceDelta: true, isAvailable: true },
      },
    },
  },
  vendor: {
    select: {
      id: true,
      slug: true,
      name: true,
      currency: true,
      status: true,
      branches: {
        where: { isPrimary: true, deletedAt: null },
        take: 1,
        select: { id: true },
      },
    },
  },
});

export function createRepository(prisma) {
  /**
   * The `where` that identifies a basket's owner.
   *
   * One shape, built once, used by every read and every write, because "scoped to
   * the owner" has to be structural rather than remembered. A `userId` cart and a
   * `guestKey` cart are two different rows and the caller is never both: the
   * service resolves precedence before this file is reached.
   */
  const ownerWhere = ({ userId, guestKey }) =>
    userId ? { userId } : { userId: null, guestKey };

  return {
    /** Exposed so the service can run several writes as one — see `addLine`. */
    transaction: (fn, options) => prisma.$transaction(fn, options),

    /**
     * The owner's live basket, or null.
     *
     * "Live" is three conditions and the extension supplies the first:
     * `deletedAt IS NULL` (a discarded basket is gone), `expiresAt` in the future
     * or absent (an abandoned one is gone), and — implicitly — one row, because a
     * second vendor's basket cannot exist while the first is live.
     */
    findLiveCart: ({ userId, guestKey, now }) =>
      prisma.cart.findFirst({
        where: {
          ...ownerWhere({ userId, guestKey }),
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { updatedAt: "desc" },
        select: CART_SELECT,
      }),

    /** The same basket by id, after a write, so the caller answers with stored rows. */
    findCartById: (id) => prisma.cart.findUnique({ where: { id }, select: CART_SELECT }),

    /**
     * Any row occupying this owner's slot for this vendor — tombstoned or expired.
     *
     * `$unfiltered` on purpose: the extension hides exactly the row this exists to
     * find. See the header on why a returning customer needs it.
     */
    findSlot: ({ userId, guestKey, vendorId }) =>
      prisma
        .$unfiltered()
        .cart.findFirst({
          where: { ...ownerWhere({ userId, guestKey }), vendorId },
          select: { id: true, deletedAt: true, expiresAt: true },
        }),

    /** Every live basket this owner holds — normally one, and the clear path takes all. */
    findOwnerCarts: ({ userId, guestKey }) =>
      prisma.cart.findMany({ where: ownerWhere({ userId, guestKey }), select: { id: true, vendorId: true } }),

    // -- Writes ---------------------------------------------------------------

    createCart: ({ id, userId, guestKey, vendorId, branchId, currency, expiresAt }, client = prisma) =>
      client.cart.create({
        data: {
          id,
          userId: userId ?? null,
          guestKey: userId ? null : (guestKey ?? null),
          vendorId,
          branchId: branchId ?? null,
          currency,
          fulfillment: toDbEnum("FulfillmentKind", "delivery"),
          expiresAt,
        },
        select: { id: true },
      }),

    /**
     * Bring a tombstoned or expired row back as an empty basket.
     *
     * `updateMany` rather than `update`: the extension leaves updates unfiltered,
     * which is what lets a soft-deleted row be written at all, and `updateMany`
     * says plainly that the row may or may not be there.
     */
    reviveCart: ({ id, branchId, currency, expiresAt }, client = prisma) =>
      client.cart.updateMany({
        where: { id },
        data: {
          deletedAt: null,
          expiresAt,
          branchId: branchId ?? null,
          currency,
          couponId: null,
          version: { increment: 1 },
        },
      }),

    /** Every write to a basket restamps its life and its version. One call, one place. */
    touchCart: ({ id, expiresAt }, client = prisma) =>
      client.cart.updateMany({ where: { id }, data: { expiresAt, version: { increment: 1 } } }),

    /** Discard a basket: tombstone the row, hard-delete the lines it held. */
    discardCart: ({ id, at }, client = prisma) =>
      client.cart.updateMany({ where: { id }, data: { deletedAt: at, version: { increment: 1 } } }),

    /** Lines leave the database — `cart_items` carries no `deletedAt`. Options cascade. */
    deleteLines: (cartId, client = prisma) => client.cartItem.deleteMany({ where: { cartId } }),

    deleteLine: ({ cartId, lineId }, client = prisma) =>
      client.cartItem.deleteMany({ where: { cartId, id: lineId } }),

    findLine: ({ cartId, lineId }, client = prisma) =>
      client.cartItem.findUnique({ where: { cartId_id: { cartId, id: lineId } }, select: ITEM_SELECT }),

    countLines: (cartId, client = prisma) => client.cartItem.count({ where: { cartId } }),

    /**
     * Add a configuration, or add to the one that is already there.
     *
     * The upsert is the merge rule from `lines.js` expressed as a statement: the
     * primary key **is** the configuration, so "same burger again" and "a new
     * burger" are the same call and PostgreSQL decides which. `{ increment }` is
     * what makes two of them arriving together sum instead of one overwriting the
     * other — the update is a single guarded statement holding a row lock, not a
     * read this process did and a write it hopes is still valid.
     *
     * The options are created only on insert. An existing line already carries
     * them, by definition: its id is a function of exactly those option ids.
     */
    upsertLine: (
      { cartId, lineId, foodId, name, image, basePrice, unitPrice, quantity, note, options },
      client = prisma,
    ) =>
      client.cartItem.upsert({
        where: { cartId_id: { cartId, id: lineId } },
        update: { quantity: { increment: quantity }, ...(note === undefined ? {} : { note }) },
        create: {
          id: lineId,
          cartId,
          foodId,
          name,
          image: image ?? "",
          basePrice,
          unitPrice,
          quantity,
          note: note ?? null,
          options: {
            // No `cartId` here: it is half of the composite foreign key
            // (`fields: [cartId, cartItemId]`), so Prisma supplies it from the
            // parent and rejects it as an unknown argument if we also state it.
            create: options.map((option) => ({
              groupId: option.groupId,
              optionId: option.optionId,
              name: option.name,
              priceDelta: option.priceDelta,
            })),
          },
        },
        select: ITEM_SELECT,
      }),

    setLineQuantity: ({ cartId, lineId, quantity }, client = prisma) =>
      client.cartItem.updateMany({ where: { cartId, id: lineId }, data: { quantity } }),

    // -- Menu, read from the cart's side --------------------------------------

    /** The dish and everything that decides whether it may go in. See `FOOD_SELECT`. */
    findFoodForCart: (foodId) => prisma.foodItem.findUnique({ where: { id: foodId }, select: FOOD_SELECT }),

    /**
     * The same, for every dish a basket holds — one statement for a whole validation.
     *
     * `findMany` rather than a loop: a validation reads every line, and N round
     * trips for an N-line basket is the query pattern that makes a cart page slow
     * for exactly the customers who filled it.
     */
    findFoodsForCart: (foodIds) =>
      foodIds.length === 0
        ? Promise.resolve([])
        : prisma.foodItem.findMany({ where: { id: { in: foodIds } }, select: FOOD_SELECT }),
  };
}

export default createRepository;
