import { Inject, Injectable } from '@nestjs/common';

import { cartConfig, type CartConfig } from '../../../config';
import { UNIT_OF_WORK, type UnitOfWorkPort } from '../../../shared/contracts';
import { fail, ok, type Result } from '../../../shared/kernel';
import { CATALOG_READER, type CatalogReaderPort } from '../../catalog/domain';
import type { FoodItemRecord } from '../../catalog/domain';
import {
  CART_REPOSITORY,
  cartCount,
  CartError,
  type CartLineRecord,
  type CartLineRequest,
  type CartOptionRecord,
  type CartOwner,
  type CartRecord,
  type CartRepositoryPort,
  type CartState,
  cartSubtotal,
  deliveryFeeFor,
  lineIdFits,
  lineUnitPrice,
  makeLineId,
  resolveSelection,
} from '../domain';

/**
 * The cart's five operations, and the rules that make them safe.
 *
 * ## What this service is a mirror of
 *
 * `frontend/stores/cart.ts`, action for action: `add`, `setQuantity`, `removeLine`,
 * `clear`, plus a read. The store keeps working exactly as it does today — it is
 * synchronous, optimistic and authoritative for what the user sees — and every mutation
 * is echoed here so the basket survives a new device, a cleared browser or a checkout that
 * happens on a laptop. That division is the whole design: the client owns *responsiveness*,
 * the server owns *truth*, and the truth is reconciled on the next read rather than
 * awaited on the click.
 *
 * ## Three things this service does that the store cannot
 *
 * 1. **It prices from the database.** The client sends `foodId`, option ids and a quantity.
 *    Names, `basePrice` and every `priceDelta` are read from the stored rows — see
 *    `policies/pricing.ts` for why the realistic threat is a stale tab rather than a
 *    hostile one.
 * 2. **It validates the configuration** against the dish's real option groups, including
 *    groups the open page has not heard about (`policies/selection.ts`).
 * 3. **It enforces one vendor per cart** without guessing what the customer wants. A
 *    cross-vendor add is refused with `vendorConflict`; the client, which has already
 *    shown the "start a new cart?" prompt, re-sends with `replaceExisting: true`.
 *
 * ## What is deliberately absent
 *
 * No coupon, no tip, no tax, no address, no fulfilment choice — the `carts` table has
 * columns for all of them and Unit 2 writes none. Those are checkout's, and a half-built
 * pricing engine that computes a total nobody can pay is worse than one that has not
 * started. `subtotal` and `deliveryFee` are returned because they are cart arithmetic
 * (`lib/cart.ts` derives them today) and because they are how the client's numbers get
 * checked against the server's.
 *
 * One rule that looks missing is missing on purpose: **a closed restaurant does not block
 * an add.** Browsing a closed kitchen and building a basket for later is normal, the
 * shipped UI permits it, and `isOpen` is a checkout-time question. What *is* checked is
 * that the vendor is still active and listable — a suspended storefront's basket would
 * fail at checkout, which is the worst moment to find out.
 */
@Injectable()
export class CartService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly repository: CartRepositoryPort,
    @Inject(CATALOG_READER) private readonly catalog: CatalogReaderPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(cartConfig.KEY) private readonly config: CartConfig,
  ) {}

  /** The owner's cart, or null when there is none. Never an error: "empty" is a state. */
  async currentCart(owner: CartOwner): Promise<CartRecord | null> {
    const state = await this.repository.findLive(owner);
    if (!state) return null;
    return this.project(state);
  }

  /**
   * Add a configured dish.
   *
   * The whole operation is one transaction because it is one act with four writes in it —
   * discard the other cart, revive or create this one, upsert the line, touch the expiry.
   * A failure halfway through leaves a customer with two live carts or none.
   */
  async addItem(
    owner: CartOwner,
    request: CartLineRequest,
    replaceExisting: boolean,
  ): Promise<Result<CartRecord>> {
    if (!this.isValidQuantity(request.quantity)) {
      return fail(CartError.invalidQuantity, {
        path: 'input.quantity',
        params: { max: this.config.maxLineQuantity },
      });
    }

    const food = await this.catalog.findFoodById(request.foodId);
    if (!food) return fail(CartError.foodNotFound, { path: 'input.foodId' });
    if (!food.isAvailable) {
      return fail(CartError.itemUnavailable, { params: { name: food.name } });
    }

    const vendor = await this.repository.loadVendorSnapshot(food.vendorId);
    if (!vendor) return fail(CartError.vendorUnavailable);

    const selection = resolveSelection(food, request.optionIds);
    if (!selection.ok) {
      return fail(selection.failure.key, {
        path: 'input.optionIds',
        params: selection.failure.params,
      });
    }

    const line = this.buildLine(food, selection.options, request.quantity);

    return this.uow.runInTransaction(async () => {
      const live = await this.repository.findLive(owner);

      if (live && live.vendorId !== food.vendorId && !replaceExisting) {
        // The client has to ask before the old basket is thrown away. Naming both
        // vendors means the prompt can be written without a second round trip.
        return fail(CartError.vendorConflict, {
          params: { currentVendorId: live.vendorId, requestedVendorId: food.vendorId },
        });
      }

      const cart = await this.repository.openCart(owner, food.vendorId, vendor.currency);

      // Checked here rather than before the transaction, because the stored key is scoped
      // by the cart id and the cart does not exist until now (`policies/line-id.ts`).
      if (!lineIdFits(cart.id, line.id)) {
        return fail(CartError.lineTooComplex, { path: 'input.optionIds' });
      }

      // The cap counts *distinct configurations*, and an add that merges into an existing
      // line adds none — so a full cart can still have its quantities raised.
      const isNewLine = !cart.lines.some((existing) => existing.id === line.id);
      if (isNewLine && cart.lines.length >= this.config.maxLines) {
        return fail(CartError.cartFull, { params: { max: this.config.maxLines } });
      }

      const merged = cart.lines.find((existing) => existing.id === line.id);
      if (merged && !this.isValidQuantity(merged.quantity + line.quantity)) {
        return fail(CartError.invalidQuantity, {
          path: 'input.quantity',
          params: { max: this.config.maxLineQuantity },
        });
      }

      await this.repository.addQuantity(cart.id, line);

      const updated = await this.repository.findLive(owner);
      return updated ? ok(await this.project(updated)) : fail(CartError.cartNotFound);
    });
  }

  /**
   * Set a line's quantity.
   *
   * Zero removes the line — the same collapse `stores/cart.ts::setQuantity` performs, and
   * the reason the stepper can go to zero without the component knowing about removal.
   */
  async updateQuantity(
    owner: CartOwner,
    lineId: string,
    quantity: number,
  ): Promise<Result<CartRecord | null>> {
    if (quantity < 0 || quantity > this.config.maxLineQuantity || !Number.isInteger(quantity)) {
      return fail(CartError.invalidQuantity, {
        path: 'input.quantity',
        params: { max: this.config.maxLineQuantity },
      });
    }
    if (quantity === 0) return this.removeItem(owner, lineId);

    return this.uow.runInTransaction(async () => {
      const cart = await this.repository.findLive(owner);
      if (!cart) return fail(CartError.cartNotFound);

      const changed = await this.repository.setQuantity(cart.id, lineId, quantity);
      if (!changed) return fail(CartError.lineNotFound, { path: 'input.lineId' });

      const updated = await this.repository.findLive(owner);
      return updated ? ok(await this.project(updated)) : ok(null);
    });
  }

  /**
   * Remove a line — and the cart with it, if that was the last one.
   *
   * Returning `null` for "the cart is gone" rather than an empty cart is what keeps the
   * server and `stores/cart.ts` agreeing: the store sets `vendor: null` when the last line
   * goes, because a basket with no items has no vendor to be single-vendor about. An empty
   * cart pinned to a restaurant would silently block the next add from anywhere else.
   */
  async removeItem(owner: CartOwner, lineId: string): Promise<Result<CartRecord | null>> {
    return this.uow.runInTransaction(async () => {
      const cart = await this.repository.findLive(owner);
      if (!cart) return fail(CartError.cartNotFound);

      const removed = await this.repository.removeLine(cart.id, lineId);
      if (!removed) return fail(CartError.lineNotFound, { path: 'input.lineId' });

      const remaining = cart.lines.filter((line) => line.id !== lineId);
      if (remaining.length === 0) {
        await this.repository.clear(cart.id);
        return ok(null);
      }

      const updated = await this.repository.findLive(owner);
      return updated ? ok(await this.project(updated)) : ok(null);
    });
  }

  /** Empty the cart. Idempotent: clearing nothing is a success, not a refusal. */
  async clearCart(owner: CartOwner): Promise<Result<null>> {
    const cart = await this.repository.findLive(owner);
    if (!cart) return ok(null);

    await this.repository.clear(cart.id);
    return ok(null);
  }

  // --- internals ------------------------------------------------------------

  private buildLine(
    food: FoodItemRecord,
    options: CartOptionRecord[],
    quantity: number,
  ): CartLineRecord {
    return {
      id: makeLineId(food.id, options.map((option) => option.optionId)),
      foodId: food.id,
      name: food.name,
      image: food.image,
      basePrice: food.price,
      unitPrice: lineUnitPrice(food.price, options),
      quantity,
      options,
    };
  }

  /**
   * Stored state → the record the resolver returns.
   *
   * The vendor snapshot is re-read on every projection rather than stored on the cart row,
   * so a delivery fee or a free-delivery threshold that changed while the basket sat is
   * the *current* one. Line prices are the opposite — those are snapshots, frozen at the
   * moment the item went in. The asymmetry is deliberate: what a dish cost when you chose
   * it is a fact about your basket; what delivery costs is a fact about tonight.
   */
  private async project(state: CartState): Promise<CartRecord> {
    const vendor = await this.repository.loadVendorSnapshot(state.vendorId);
    if (!vendor) {
      // Reachable only if the vendor was suspended while the basket sat. The cart is not
      // deleted — the customer may still want to see it — but it cannot be priced with a
      // fee nobody publishes any more, so the snapshot degrades to zeroes rather than
      // inventing a number.
      const subtotal = cartSubtotal(state.lines);
      return {
        id: state.id,
        vendor: {
          id: state.vendorId,
          slug: '',
          name: '',
          currency: '',
          countryCode: '',
          deliveryFee: 0,
          minOrder: 0,
          freeDeliveryOver: null,
        },
        lines: state.lines,
        subtotal,
        deliveryFee: 0,
        count: cartCount(state.lines),
        updatedAt: state.updatedAt,
      };
    }

    const subtotal = cartSubtotal(state.lines);
    return {
      id: state.id,
      vendor,
      lines: state.lines,
      subtotal,
      deliveryFee: deliveryFeeFor(vendor, subtotal),
      count: cartCount(state.lines),
      updatedAt: state.updatedAt,
    };
  }

  private isValidQuantity(quantity: number): boolean {
    return Number.isInteger(quantity) && quantity >= 1 && quantity <= this.config.maxLineQuantity;
  }
}
