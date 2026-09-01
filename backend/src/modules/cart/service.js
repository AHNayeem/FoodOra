/**
 * service.js — the basket: who owns it, what may go in it, and what it costs.
 *
 * `repository.js` speaks Prisma, `lines.js` holds the identity and the arithmetic
 * that need no database, and module 5's `options.js` and `availability.js` hold
 * the menu rules this module refuses to write a second copy of. The controller
 * passes plain values in and gets `{ payload }` or `{ refusal, path }` back —
 * modules 2 and 5's convention, so the envelope decision is made once.
 *
 * ## 1. Ownership: an authenticated actor wins, always
 *
 * A basket predates a customer. The prototype lets an anonymous visitor browse,
 * configure a dish and fill a cart, and only asks who they are at checkout, so
 * ownership is `userId` **or** `guestKey` and precedence runs one way only:
 *
 *  - a request carrying a usable session uses the **actor's id and ignores the
 *    guest key entirely**. If the key could override the actor, anybody could
 *    read a basket by replaying a key they had seen; if it merely supplemented
 *    the actor, a customer signing in on a second device would find their basket
 *    empty, because the key belongs to the first browser;
 *  - a request with neither is `UNAUTHENTICATED` — *thrown*, not refused. "You
 *    did not say who you are" and "your basket is empty" are different facts and
 *    a client that conflates them shows an empty cart to somebody who has one.
 *
 * Possession of the key **is** the claim to the basket, exactly as with any
 * anonymous session cookie, and `lib/cart-key.ts` says so in as many words. That
 * is acceptable for a basket — nothing in it can be spent — and it is why 128
 * bits of `crypto.getRandomValues` and a 16-character floor are the whole of the
 * guest security model, and why checkout will require a real account.
 *
 * **Isolation is structural, not a check.** Every read and every write is scoped
 * by the owner clause `repository.js::ownerWhere` builds, so customer B's line id
 * does not resolve inside customer A's basket — there is no place in this file
 * where a row is fetched by id and then compared to an owner, because that is the
 * shape that eventually forgets.
 *
 * ## 2. Prices are snapshots, and the client may not state one
 *
 * `orders.prisma` decides this, not this file: *"Snapshots, so a menu edit never
 * silently reprices a live basket."* `cart_items.basePrice` / `unitPrice` and
 * `cart_item_options.name` / `priceDelta` are written once, from the stored menu
 * rows, at the moment the line goes in.
 *
 * So the add input carries `foodId`, `optionIds` and a quantity and **nothing
 * else** — no price, no option name, no delta. The realistic threat is not a
 * hostile customer editing a request, it is a menu that changed between the page
 * render and the click: the client builds its line from the `FoodItem` the page
 * was rendered with, which is correct right up until a merchant repriced the dish
 * two minutes ago. Rebuilding from stored rows is also what makes the snapshot
 * mean something — it is the price as it really was, which is what a later
 * dispute is about.
 *
 * A price that changes *after* the line is in is therefore **reported, never
 * applied**: `validate` says `price-changed` with both numbers and mutates
 * nothing. Silently repricing a basket is the behaviour the snapshot exists to
 * prevent, and silently refusing one at checkout is the behaviour a customer
 * calls support about.
 *
 * ## 3. This module does not reserve stock
 *
 * The single most consequential decision here, argued in full in
 * `docs/backend/M6-cart.md` §9. In short: `catalog.prisma` says what `reserved`
 * is — *"Held by unfulfilled orders"* — and a basket is not an order. Stock is
 * **read** and honoured (`available = onHand − reserved`, module 5's subtraction)
 * and never written. Every cart operation leaves `InventoryItem.reserved`
 * byte-identical, and `tests/cart.test.js` asserts exactly that.
 *
 * ## 4. What this module deliberately does not price
 *
 * `subtotal` and `count`, from stored snapshots, and nothing else. No delivery
 * fee, no tax, no coupon, no tip, no total. `lib/cart.ts::deliveryFeeFor` exists
 * on the client and BACKEND-REQUIREMENTS §3 row 7 gives all of it to checkout;
 * a fee computed here would be a second pricing engine that module 7 would then
 * have to agree with, and two engines that agree today are two engines that
 * disagree after the first promotion. The vendor's *terms* travel with the cart
 * — `deliveryFee`, `minOrder`, `freeDeliveryOver`, read from the branch row —
 * because `types/cart.ts::CartVendor` is a snapshot the drawer renders and
 * checkout prices against. Terms are data; a fee is a decision.
 */
import { badRequest, unauthenticated } from "../../shared/errors/app-error.js";
import { toApiEnum } from "../../shared/utils/enums.js";
import { toJsonSafe } from "../../shared/utils/serialize.js";
import { availableQuantity, deriveItemAvailability } from "../menu/availability.js";
import { checkSelection } from "../menu/options.js";
import { PUBLIC_STATUSES } from "../catalog/repository.js";
import { cartTotals, canonicalOptionIds, dec, lineUnitPrice, makeLineId } from "./lines.js";
import { isUsableGuestKey } from "./schemas.js";

/**
 * The refusal keys this module emits.
 *
 * Three are reused from `menuBuilder.errors.*`, which module 5 already answers
 * with, because the fact is the same one seen from the customer's side: a dish
 * that left the menu is `errors.itemNotFound` whoever is asking.
 *
 * The `cart.errors.*` six are **new keys added to all three locale files** in
 * this module's change, and adding them was not optional: `messages/*.json` had
 * a `cart` namespace with no `errors` at all, because the prototype's basket
 * refuses nothing — it is a Zustand store that cannot fail. A server that can
 * refuse needs the customer to be told why, and a refusal whose key has no
 * translation renders as "something went wrong", which is the same as not
 * explaining it. They are **not** in `RENDERABLE` in `lib/graphql/result.ts`, for
 * the reason module 5 left the menu keys out of it: that file belongs to the
 * GraphQL client the cutover has to decide the fate of (audit A4), and widening
 * a whitelist for a transport this API does not speak would be the wrong edit.
 */
export const CART_ERRORS = Object.freeze({
  /** A basket may hold one restaurant. `stores/cart.ts` prompts; the server refuses. */
  vendorConflict: "cart.errors.vendorConflict",
  /** The dish is on the menu and cannot be ordered right now — 86'd, or its section is off. */
  itemUnavailable: "cart.errors.itemUnavailable",
  /** Fewer portions left than were asked for. `onHand − reserved`. */
  outOfStock: "cart.errors.outOfStock",
  /** `CART_MAX_LINES` distinct configurations. */
  cartFull: "cart.errors.cartFull",
  /** `CART_MAX_LINE_QUANTITY` of one configuration. */
  quantityLimit: "cart.errors.quantityLimit",
  /** The modifiers picked are not orderable — see `checkSelection`'s codes. */
  selectionInvalid: "cart.errors.selectionInvalid",
  /** The dish, or the line, is not there at all. `menuBuilder.errors.itemNotFound`. */
  itemGone: "errors.itemNotFound",
});

/**
 * Validation findings. Machine-readable codes, not i18n keys, for the reason
 * `options.js::checkSelection` gives: a validation reports *everything* wrong at
 * once and the surface decides what to say about the set. A refusal answers one
 * question with one key; a validation answers "is this basket still orderable"
 * with a list.
 */
export const VALIDATION_CODES = Object.freeze([
  "cart-empty",
  "vendor-unavailable",
  "item-gone",
  "item-unavailable",
  "insufficient-stock",
  "selection-invalid",
  "option-gone",
  "price-changed",
]);

/** Thrown inside a transaction to roll it back and answer with a refusal. */
class Refused extends Error {
  constructor(refusal, path = undefined, detail = undefined) {
    super(`cart refused: ${refusal}`);
    this.name = "Refused";
    this.refusal = refusal;
    this.path = path;
    this.detail = detail;
  }
}

/** `{ refusal, path }` — the controller turns it into the 200 refusal envelope. */
const refuse = (refusal, path) => (path ? { refusal, path } : { refusal });

export function createService({ repo, newId, limits = {}, log = null }) {
  const maxLines = limits.maxLines ?? 50;
  const maxLineQuantity = limits.maxLineQuantity ?? 99;
  const ttlHours = limits.ttlHours ?? 72;

  /** When a basket written now stops being live. Restamped by every mutation. */
  const expiryFrom = (now) => new Date(now.getTime() + ttlHours * 3_600_000);

  // ---------------------------------------------------------------------------
  // Ownership
  // ---------------------------------------------------------------------------

  /**
   * Who this request's basket belongs to. See §1 of the header for the precedence.
   *
   * Throws rather than refusing, because it is not a business answer: there is no
   * basket to talk about and no owner to talk to.
   */
  function ownerOf({ userId = null, guestKey = null }) {
    if (userId) return { userId, guestKey: null };
    if (guestKey === null || guestKey === undefined) {
      throw unauthenticated("A cart needs a signed-in customer or an X-Cart-Key header");
    }
    // Checked here and not by a `headers` schema — `schemas.js::isUsableGuestKey`
    // explains why that schema would delete the `authorization` header.
    if (!isUsableGuestKey(guestKey)) {
      throw badRequest("X-Cart-Key must be 16-60 characters of [A-Za-z0-9_-]");
    }
    return { userId: null, guestKey };
  }

  // ---------------------------------------------------------------------------
  // Projections
  // ---------------------------------------------------------------------------

  /** `types/cart.ts::CartSelectedOption`. */
  const toOption = (row) => ({
    groupId: row.groupId,
    optionId: row.optionId,
    name: row.name,
    priceDelta: dec(row.priceDelta).toNumber(),
  });

  /**
   * `types/cart.ts::CartLine`, plus the `note` the schema carries and the frontend
   * type does not yet. Nothing here is recomputed: every number is the stored
   * snapshot, which is the whole point of §2.
   */
  const toLine = (row) => ({
    id: row.id,
    foodId: row.foodId,
    name: row.name,
    image: row.image,
    basePrice: dec(row.basePrice).toNumber(),
    unitPrice: dec(row.unitPrice).toNumber(),
    quantity: row.quantity,
    note: row.note ?? null,
    options: (row.options ?? []).map(toOption),
    lineTotal: dec(row.unitPrice).times(row.quantity).toNumber(),
  });

  /**
   * `types/cart.ts::CartVendor` — the storefront snapshot the drawer renders.
   *
   * `location` is optional in the frontend type and is filled here whenever the
   * vendor has a primary branch, because a basket has to be able to answer the
   * delivery-zone question on its own (G37). A vendor with no primary branch is
   * an onboarding bug (module 15), logged rather than fatal, exactly as module 5
   * treats a missing branch timezone.
   */
  function toVendor(vendor) {
    const branch = vendor.branches?.[0] ?? null;
    if (!branch && log) {
      log.warn({ vendorId: vendor.id }, "cart: storefront has no primary branch — delivery terms unknown");
    }
    return {
      id: vendor.id,
      slug: vendor.slug,
      name: vendor.name,
      currency: vendor.currency,
      countryCode: branch?.countryCode ?? null,
      location: branch ? { lat: dec(branch.lat).toNumber(), lng: dec(branch.lng).toNumber(), place: branch.address } : null,
      deliveryFee: branch ? dec(branch.deliveryFee).toNumber() : 0,
      minOrder: branch ? dec(branch.minOrder).toNumber() : 0,
      freeDeliveryOver: branch?.freeDeliveryOver == null ? null : dec(branch.freeDeliveryOver).toNumber(),
    };
  }

  /** The whole read model. `subtotal` and `count` are §4's two numbers and no others. */
  function toCart(row) {
    if (!row) return null;
    const lines = (row.items ?? []).map(toLine);
    const totals = cartTotals(row.items ?? []);
    return toJsonSafe({
      id: row.id,
      vendorId: row.vendorId,
      branchId: row.branchId,
      currency: row.currency,
      fulfillment: toApiEnum("FulfillmentKind", row.fulfillment),
      vendor: toVendor(row.vendor),
      lines,
      subtotal: totals.subtotal.toNumber(),
      count: totals.count,
      lineCount: totals.lineCount,
      updatedAt: row.updatedAt,
      expiresAt: row.expiresAt,
      version: row.version,
    });
  }

  // ---------------------------------------------------------------------------
  // Menu integration
  // ---------------------------------------------------------------------------

  /**
   * Is this dish orderable, and at what price, with these modifiers?
   *
   * Every one of §6's twelve checks lands here, and none of them is written twice:
   * `deriveItemAvailability` is module 5's fold (`switch AND (untracked OR in
   * stock) AND section active AND menu active`) and `checkSelection` is module 5's
   * modifier rule, which M5 §15 named as the function this module should call
   * rather than re-deriving. A second copy of either is a menu that says one thing
   * on the restaurant page and another in the basket.
   *
   * Returns `{ refusal }` or a fully priced snapshot built from stored rows.
   */
  function resolveAddition(food, optionIds) {
    // A deleted dish never arrives here — `findFoodForCart` is soft-delete
    // filtered — but a deleted *section* or *menu* does: nested relations are not,
    // and `repository.js` says why. A dish whose board was deleted is gone, not
    // merely unavailable, and the two are different messages.
    const section = food.section ?? null;
    const menu = section?.menu ?? null;
    if (!section || section.deletedAt || !menu || menu.deletedAt) {
      return { refusal: CART_ERRORS.itemGone, path: "foodId" };
    }

    // A storefront the directory refuses to show cannot be put in a basket.
    // `PUBLIC_STATUSES` is module 4's own list — `active` and `paused` — so a
    // restaurant that is merely closed for the evening is still addable, which is
    // the behaviour the shipped UI has: browsing a closed kitchen and building a
    // basket for later is normal, and openness is a checkout-time question.
    const vendorStatus = toApiEnum("VendorStatus", food.vendor.status);
    if (!PUBLIC_STATUSES.includes(vendorStatus)) {
      return { refusal: CART_ERRORS.itemUnavailable, path: "foodId" };
    }

    const inventory = food.inventory ?? null;
    const availability = deriveItemAvailability({
      item: food,
      inventory,
      sectionActive: section.isActive === true,
      menuActive: menu.isActive === true,
    });
    if (!availability.isAvailable) {
      return {
        refusal: availability.reason === "out-of-stock" ? CART_ERRORS.outOfStock : CART_ERRORS.itemUnavailable,
        path: "foodId",
      };
    }

    const groups = food.optionGroups ?? [];
    const selection = checkSelection({ item: food, groups, chosen: optionIds, available: true });
    if (!selection.valid) {
      const first = selection.violations[0];
      return {
        refusal: CART_ERRORS.selectionInvalid,
        path: first?.groupId ? `options.${first.groupId}` : "options",
        violations: selection.violations,
      };
    }

    /**
     * The chosen options, resolved to their **stored** rows.
     *
     * Sorted by id so that the persisted order matches the line id's own sort and
     * two identical baskets are byte-identical. Name and delta come from the row,
     * never from the request — §2.
     */
    const byId = new Map();
    for (const group of groups) for (const option of group.options ?? []) byId.set(option.id, { option, group });

    const options = canonicalOptionIds(selection.selected).map((id) => {
      const { option, group } = byId.get(id);
      return { groupId: group.id, optionId: option.id, name: option.name, priceDelta: dec(option.priceDelta) };
    });

    return {
      lineId: makeLineId(food.id, options.map((option) => option.optionId)),
      foodId: food.id,
      vendorId: food.vendorId,
      name: food.name,
      image: food.image ?? "",
      basePrice: dec(food.price),
      unitPrice: lineUnitPrice(food.price, options.map((option) => option.priceDelta)),
      options,
      inventory,
      stockState: availability.stockState,
    };
  }

  /** `onHand − reserved`, or `null` when the dish is not counted. Never written. */
  const availableFor = (inventory) =>
    inventory && inventory.trackStock === true ? availableQuantity(inventory) : null;

  // ---------------------------------------------------------------------------
  // Cart resolution
  // ---------------------------------------------------------------------------

  /**
   * The basket this add belongs in, created or revived inside the caller's
   * transaction.
   *
   * The awkward case is the returning customer, and it is the one V1 found the
   * hard way: `@@unique([userId, vendorId])` does not know about `deletedAt`, so
   * a tombstoned basket still occupies its slot and an `INSERT` collides. The
   * partial index `carts_guest_vendor_uq` says the same thing for a guest key.
   * So a slot that exists is **revived**; only a slot that does not is created.
   */
  async function ensureCart(tx, { owner, vendor, now }) {
    const expiresAt = expiryFrom(now);
    const branchId = vendor.branches?.[0]?.id ?? null;

    const slot = await repo.findSlot({ ...owner, vendorId: vendor.id });
    if (slot) {
      await repo.reviveCart({ id: slot.id, branchId, currency: vendor.currency, expiresAt }, tx);
      return slot.id;
    }

    const id = newId("cart");
    await repo.createCart(
      { id, ...owner, vendorId: vendor.id, branchId, currency: vendor.currency, expiresAt },
      tx,
    );
    return id;
  }

  /** Tombstone a basket and hard-delete its lines. `carts` has `deletedAt`; `cart_items` does not. */
  async function discard(tx, cartId, now) {
    await repo.deleteLines(cartId, tx);
    await repo.discardCart({ id: cartId, at: now }, tx);
  }

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  /** The owner's basket, or `null`. Never creates one — a read that writes is not a read. */
  async function getCart(identity, { now = new Date() } = {}) {
    const owner = ownerOf(identity);
    return toCart(await repo.findLiveCart({ ...owner, now }));
  }

  /**
   * Put a configured dish in the basket, or add to the line already holding it.
   *
   * The whole mutation is one transaction, and every part of it has to be: the
   * basket may have to be created, the line-count cap read, the line upserted and
   * the basket restamped, and a failure after the second of those would leave a
   * basket that exists with a line that does not.
   *
   * The caps are enforced **after** the increment rather than before it, which
   * looks backwards and is the only correct order. Checking first is a
   * read-then-write: two adds that each see 98 both write and the line lands at
   * 100. Incrementing first takes the row lock, so the two serialise, and the
   * loser sees the real post-increment number and rolls its whole transaction
   * back. Nothing partial survives — that is what `Refused` thrown inside
   * `$transaction` buys.
   */
  async function addItem(identity, input, { now = new Date() } = {}) {
    const owner = ownerOf(identity);
    const quantity = Number(input.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1) return refuse(CART_ERRORS.quantityLimit, "quantity");
    if (quantity > maxLineQuantity) return refuse(CART_ERRORS.quantityLimit, "quantity");

    const food = await repo.findFoodForCart(input.foodId);
    if (!food) return refuse(CART_ERRORS.itemGone, "foodId");

    const addition = resolveAddition(food, input.optionIds ?? []);
    if (addition.refusal) return refuse(addition.refusal, addition.path);

    // The single-vendor rule, decided before the transaction so the refusal costs
    // no writes. `orders.prisma`: "A cart is single-vendor by construction" — a
    // basket holding two restaurants' dishes cannot be delivered, and discovering
    // that at checkout is discovering it too late. The server refuses by default
    // rather than trusting the client to have asked; `replaceExisting` is the
    // customer's answer to `cart.switchTitle`, relayed.
    const live = await repo.findLiveCart({ ...owner, now });
    if (live && live.vendorId !== addition.vendorId && input.replaceExisting !== true) {
      return refuse(CART_ERRORS.vendorConflict, "vendorId");
    }

    const available = availableFor(addition.inventory);

    try {
      const cartId = await repo.transaction(async (tx) => {
        if (live && live.vendorId !== addition.vendorId) await discard(tx, live.id, now);

        const id =
          live && live.vendorId === addition.vendorId
            ? live.id
            : await ensureCart(tx, { owner, vendor: food.vendor, now });

        // Counted before the upsert because the cap is about *distinct
        // configurations*, and after the upsert an insert is indistinguishable
        // from an increment. A racing pair can therefore both see `maxLines - 1`
        // and both insert; the cap is a guard against a script, not an invariant
        // the money depends on, and one line over it is not worth serialising
        // every add in the system.
        const existing = await repo.findLine({ cartId: id, lineId: addition.lineId }, tx);
        if (!existing && (await repo.countLines(id, tx)) >= maxLines) {
          throw new Refused(CART_ERRORS.cartFull, "items");
        }

        const line = await repo.upsertLine(
          {
            cartId: id,
            lineId: addition.lineId,
            foodId: addition.foodId,
            name: addition.name,
            image: addition.image,
            basePrice: addition.basePrice,
            unitPrice: addition.unitPrice,
            quantity,
            note: input.note,
            options: addition.options,
          },
          tx,
        );

        if (line.quantity > maxLineQuantity) throw new Refused(CART_ERRORS.quantityLimit, "quantity");
        if (available !== null && available.lt(line.quantity)) {
          throw new Refused(CART_ERRORS.outOfStock, "quantity");
        }

        await repo.touchCart({ id, expiresAt: expiryFrom(now) }, tx);
        return id;
      });

      return { payload: toCart(await repo.findCartById(cartId)) };
    } catch (error) {
      if (error instanceof Refused) return refuse(error.refusal, error.path);
      throw error;
    }
  }

  /**
   * Set a line's quantity outright.
   *
   * Zero is a **removal**, not a refusal and not a zero-quantity row.
   * `stores/cart.ts::setQuantity` already collapses `<= 0` into `removeLine`, the
   * schema's `quantity` is a bare `SMALLINT` with no check constraint, and a line
   * of zero portions would be a thing the kitchen has to interpret. Accepting it
   * here means a client that does not collapse cannot create one.
   */
  async function updateQuantity(identity, lineId, quantity, { now = new Date() } = {}) {
    const owner = ownerOf(identity);
    if (!Number.isInteger(quantity) || quantity < 0) return refuse(CART_ERRORS.quantityLimit, "quantity");
    if (quantity === 0) return removeItem(identity, lineId, { now });
    if (quantity > maxLineQuantity) return refuse(CART_ERRORS.quantityLimit, "quantity");

    const cart = await repo.findLiveCart({ ...owner, now });
    if (!cart) return refuse(CART_ERRORS.itemGone, "lineId");

    // Scoped to *this* basket, so another customer's line id resolves to nothing.
    const line = cart.items.find((item) => item.id === lineId);
    if (!line) return refuse(CART_ERRORS.itemGone, "lineId");

    // Raising a quantity is an add by another name, so it answers to the same
    // stock. Lowering one is not, and must stay possible even for a dish that has
    // since sold out — refusing to *reduce* a basket would be absurd.
    if (quantity > line.quantity) {
      const food = await repo.findFoodForCart(line.foodId);
      if (!food) return refuse(CART_ERRORS.itemGone, "lineId");
      const available = availableFor(food.inventory ?? null);
      if (available !== null && available.lt(quantity)) return refuse(CART_ERRORS.outOfStock, "quantity");
    }

    try {
      await repo.transaction(async (tx) => {
        // `updateMany` scoped by `cartId` as well as the line id: the guard is the
        // statement, so a line that left the basket between the read above and
        // this write matches nothing and the whole transaction rolls back rather
        // than reporting a quantity it did not set.
        const { count } = await repo.setLineQuantity({ cartId: cart.id, lineId, quantity }, tx);
        if (count === 0) throw new Refused(CART_ERRORS.itemGone, "lineId");
        await repo.touchCart({ id: cart.id, expiresAt: expiryFrom(now) }, tx);
      });
    } catch (error) {
      if (error instanceof Refused) return refuse(error.refusal, error.path);
      throw error;
    }

    return { payload: toCart(await repo.findCartById(cart.id)) };
  }

  /**
   * Take a line out.
   *
   * **Idempotent**, and deliberately so: `stores/cart.ts` mirrors every mutation
   * fire-and-forget, so a retry after a timeout is ordinary rather than
   * exceptional, and "that line is already gone" is the outcome the caller wanted.
   *
   * Removing the **last** line discards the basket, so `GET` then answers `null`.
   * That is what the store does — `removeLine` sets `vendor: null` when the lines
   * run out — and it is what keeps the single-vendor rule from making an emptied
   * basket block the next restaurant.
   */
  async function removeItem(identity, lineId, { now = new Date() } = {}) {
    const owner = ownerOf(identity);
    const cart = await repo.findLiveCart({ ...owner, now });
    if (!cart) return { payload: null };

    const remaining = cart.items.filter((item) => item.id !== lineId);

    await repo.transaction(async (tx) => {
      await repo.deleteLine({ cartId: cart.id, lineId }, tx);
      if (remaining.length === 0) await discard(tx, cart.id, now);
      else await repo.touchCart({ id: cart.id, expiresAt: expiryFrom(now) }, tx);
    });

    if (remaining.length === 0) return { payload: null };
    return { payload: toCart(await repo.findCartById(cart.id)) };
  }

  /**
   * Empty the basket.
   *
   * Every live basket the owner holds, not just the one — normally there is
   * exactly one, and "normally" is not a thing to leave rows behind on. Repeating
   * it is safe and answers `null` both times.
   */
  async function clearCart(identity, { now = new Date() } = {}) {
    const owner = ownerOf(identity);
    const carts = await repo.findOwnerCarts(owner);
    if (carts.length === 0) return { payload: null };

    await repo.transaction(async (tx) => {
      for (const cart of carts) await discard(tx, cart.id, now);
    });
    return { payload: null };
  }

  /**
   * Is this basket still orderable, and what changed since it was filled?
   *
   * A **report**, at `success: true`, that mutates nothing. §12 of the brief asks
   * for exactly that and the reason is worth stating: a validation that repaired
   * the basket would remove a dish while the customer was looking at it, and the
   * customer is the one who gets to decide whether an order without the sea bass
   * is still the order they wanted. Checkout (module 7) reads this and blocks;
   * repairing is a separate, explicit act.
   *
   * One statement reads every dish — `findFoodsForCart` — because a validation
   * that issued one query per line would be slowest for exactly the customers who
   * filled a basket.
   */
  async function validateCart(identity, { now = new Date() } = {}) {
    const owner = ownerOf(identity);
    const cart = await repo.findLiveCart({ ...owner, now });
    if (!cart || cart.items.length === 0) {
      return { valid: false, issues: [{ code: "cart-empty", lineId: null }], cart: toCart(cart) };
    }

    const issues = [];
    const vendorStatus = toApiEnum("VendorStatus", cart.vendor.status);
    if (!PUBLIC_STATUSES.includes(vendorStatus)) {
      issues.push({ code: "vendor-unavailable", lineId: null, vendorId: cart.vendorId });
    }

    const foods = await repo.findFoodsForCart([...new Set(cart.items.map((item) => item.foodId))]);
    const byFoodId = new Map(foods.map((food) => [food.id, food]));

    for (const line of cart.items) {
      const food = byFoodId.get(line.foodId);
      if (!food) {
        issues.push({ code: "item-gone", lineId: line.id, foodId: line.foodId });
        continue;
      }

      // A dish whose vendor moved is not a case the schema can produce, but a
      // basket that outlived a re-parented menu is, and a line from another
      // restaurant is the one thing checkout must never see.
      if (food.vendorId !== cart.vendorId) {
        issues.push({ code: "item-gone", lineId: line.id, foodId: line.foodId });
        continue;
      }

      const section = food.section ?? null;
      const menu = section?.menu ?? null;
      if (!section || section.deletedAt || !menu || menu.deletedAt) {
        issues.push({ code: "item-gone", lineId: line.id, foodId: line.foodId });
        continue;
      }

      const availability = deriveItemAvailability({
        item: food,
        inventory: food.inventory ?? null,
        sectionActive: section.isActive === true,
        menuActive: menu.isActive === true,
      });
      if (!availability.isAvailable) {
        issues.push({
          code: "item-unavailable",
          lineId: line.id,
          foodId: line.foodId,
          reason: availability.reason,
        });
      }

      const available = availableFor(food.inventory ?? null);
      if (available !== null && available.lt(line.quantity)) {
        issues.push({
          code: "insufficient-stock",
          lineId: line.id,
          foodId: line.foodId,
          requested: line.quantity,
          available: available.toNumber(),
        });
      }

      // The stored selection, re-judged against today's menu. An option somebody
      // deleted is `option-gone`; a group whose `min` a merchant raised since is
      // `selection-invalid`. Both are the customiser's question again and neither
      // is answerable by looking at the snapshot alone.
      const storedOptionIds = line.options.map((option) => option.optionId);
      const selection = checkSelection({
        item: food,
        groups: food.optionGroups ?? [],
        chosen: storedOptionIds,
        available: true,
      });
      if (!selection.valid) {
        const gone = selection.violations.filter((violation) => violation.code === "unknown-option");
        for (const violation of gone) {
          issues.push({ code: "option-gone", lineId: line.id, optionId: violation.optionId });
        }
        const rest = selection.violations.filter((violation) => violation.code !== "unknown-option");
        for (const violation of rest) {
          issues.push({
            code: "selection-invalid",
            lineId: line.id,
            groupId: violation.groupId ?? null,
            violation: violation.code,
          });
        }
      }

      // The snapshot, against the price as it is now. Reported with **both**
      // numbers so the surface can say "was 720, now 780" — and never applied
      // here, per §2 of the header.
      const currentBase = dec(food.price);
      const byId = new Map();
      for (const group of food.optionGroups ?? []) for (const option of group.options ?? []) byId.set(option.id, option);
      const currentDeltas = storedOptionIds.map((id) => (byId.has(id) ? dec(byId.get(id).priceDelta) : dec(0)));
      const currentUnit = lineUnitPrice(currentBase, currentDeltas);

      if (!currentUnit.equals(dec(line.unitPrice))) {
        issues.push({
          code: "price-changed",
          lineId: line.id,
          foodId: line.foodId,
          storedUnitPrice: dec(line.unitPrice).toNumber(),
          currentUnitPrice: currentUnit.toNumber(),
        });
      }
    }

    return { valid: issues.length === 0, issues: toJsonSafe(issues), cart: toCart(cart) };
  }

  return { getCart, addItem, updateQuantity, removeItem, clearCart, validateCart, limits: { maxLines, maxLineQuantity, ttlHours } };
}

export default createService;
