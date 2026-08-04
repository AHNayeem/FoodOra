import { Inject, Injectable } from '@nestjs/common';

import { cartConfig, type CartConfig } from '../../../config';
import { IdService } from '../../../common/ids';
import { Prisma } from '../../../infrastructure/prisma/generated';
import { TransactionManager } from '../../../infrastructure/prisma';
import { CLOCK, type Clock } from '../../../shared/kernel';
import { CATALOG_READER, type CatalogReaderPort } from '../../catalog/domain';
import {
  type CartLineRecord,
  type CartOwner,
  type CartRepositoryPort,
  type CartState,
  type CartVendorRecord,
  storedLineId,
  toWireLineId,
} from '../domain';

/**
 * The only file in the module that knows Prisma exists.
 *
 * The same three E3 conventions hold as in the catalog's repository — nothing here opens a
 * transaction, the soft-delete extension filters only the top-level `where`, and `Decimal`
 * does not leave this file. Two more are specific to the cart:
 *
 * **A tombstoned cart still owns its unique slot.** `carts` is `@@unique([userId,
 * vendorId])` and soft delete only sets `deletedAt`, so inserting a second cart for a
 * vendor the customer previously abandoned violates the constraint. `openCart` therefore
 * looks *through* tombstones (`deletedAt` in the `where` is the extension's documented
 * opt-out) and revives the row it finds. Getting this wrong produces a unique-violation
 * that only appears for customers who came back — the hardest kind to reproduce.
 *
 * **Quantity is incremented in SQL, never read-modify-written.** Two taps on "add" are two
 * concurrent requests; `{ increment }` makes the database serialise them, while reading 1
 * and writing 2 twice leaves a quantity of 2 where it should be 3.
 */
@Injectable()
export class PrismaCartRepository implements CartRepositoryPort {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly ids: IdService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CATALOG_READER) private readonly catalog: CatalogReaderPort,
    @Inject(cartConfig.KEY) private readonly config: CartConfig,
  ) {}

  private get db() {
    return this.transactions.client;
  }

  async findLive(owner: CartOwner): Promise<CartState | null> {
    const row = await this.db.cart.findFirst({
      where: ownerWhere(owner),
      // Most recently touched wins. There should only ever be one live cart — `openCart`
      // is what guarantees it — but ordering makes the invariant's failure benign
      // (the newest basket) rather than arbitrary (whatever Postgres returned first).
      orderBy: { updatedAt: 'desc' },
      select: CART_SELECT,
    });

    return row ? toState(row) : null;
  }

  async openCart(owner: CartOwner, vendorId: string, currency: string): Promise<CartState> {
    const live = await this.db.cart.findFirst({
      where: ownerWhere(owner),
      orderBy: { updatedAt: 'desc' },
      select: CART_SELECT,
    });

    if (live && live.vendorId === vendorId) {
      await this.touch(live.id);
      return toState(live);
    }

    // A different vendor: the caller has already established that this is intended
    // (`CartService` refuses without `replaceExisting`). Discard rather than keep two.
    if (live) {
      await this.db.cartItem.deleteMany({ where: { cartId: live.id } });
      await this.db.cart.softDelete({ where: { id: live.id } });
    }

    const revived = await this.reviveOrCreate(owner, vendorId, currency);
    return revived;
  }

  /**
   * Guest basket → account basket, built entirely from this class's own public methods.
   *
   * Re-inserting the lines rather than reassigning `carts.userId` looks like the long way
   * round and is the only correct one. Two constraints make the direct `UPDATE` wrong:
   *
   * 1. **`@@unique([userId, vendorId])` counts tombstones.** If this customer ever
   *    abandoned a basket at this restaurant, the row is still there with a `deletedAt`,
   *    and stamping the guest cart with the same `(userId, vendorId)` violates the
   *    constraint. `openCart` already knows how to revive that row — it was written for
   *    exactly this case.
   * 2. **`cart_items.id` is prefixed with the cart id** (`policies/line-id.ts`), so items
   *    cannot simply change parents; their primary keys would have to be rewritten. That
   *    is DSC-1 charging interest, and it is worth naming: the workaround made an
   *    otherwise trivial `UPDATE … SET cartId` into a copy. Once `@@id([cartId, id])`
   *    lands, this method gets shorter.
   *
   * `addQuantity` also means an account that had a tombstoned cart for this vendor ends up
   * with the guest's lines and none of the abandoned ones, which is right: those were
   * priced against a menu that is now weeks old.
   */
  async adoptGuestCart(userId: string, guestKey: string): Promise<CartState | null> {
    const mine = await this.findLive({ userId });
    if (mine) return mine;

    const guest = await this.db.cart.findFirst({
      where: { userId: null, guestKey },
      orderBy: { updatedAt: 'desc' },
      select: { ...CART_SELECT, currency: true },
    });
    if (!guest) return null;
    if (guest.items.length === 0) {
      // An empty guest cart is not worth adopting — and adopting it would occupy the
      // account's `(userId, vendorId)` slot with nothing in it.
      return null;
    }

    const guestState = toState(guest);
    const target = await this.openCart({ userId }, guest.vendorId, guest.currency);
    for (const line of guestState.lines) {
      await this.addQuantity(target.id, line);
    }
    await this.clear(guestState.id);

    return this.findLive({ userId });
  }

  async addQuantity(cartId: string, line: CartLineRecord): Promise<void> {
    await this.db.cartItem.upsert({
      // Scoped by cart — see `policies/line-id.ts`. Keyed on the bare line id, this upsert
      // would find another customer's identical configuration and increment *their* basket.
      where: { id: storedLineId(cartId, line.id) },
      create: {
        id: storedLineId(cartId, line.id),
        cartId,
        foodId: line.foodId,
        name: line.name,
        image: line.image,
        basePrice: new Prisma.Decimal(line.basePrice),
        unitPrice: new Prisma.Decimal(line.unitPrice),
        quantity: line.quantity,
        options: {
          create: line.options.map((option) => ({
            groupId: option.groupId,
            optionId: option.optionId,
            name: option.name,
            priceDelta: new Prisma.Decimal(option.priceDelta),
          })),
        },
      },
      update: {
        quantity: { increment: line.quantity },
        /**
         * The snapshot is *not* refreshed on a merge, and that is the interesting choice.
         * Refreshing would mean a repriced dish silently changes the price of the units
         * already in the basket; leaving it means the whole line keeps the price it was
         * added at. Neither is obviously right, but only one of them can surprise a
         * customer who is watching the total, and it is the other one.
         */
      },
    });

    await this.touch(cartId);
  }

  async setQuantity(cartId: string, lineId: string, quantity: number): Promise<boolean> {
    // `updateMany` rather than `update`, and `cartId` stays in the filter even though the
    // stored key already contains it: defence in depth costs nothing here, and it means a
    // future change to the key encoding cannot quietly widen the blast radius to another
    // customer's line.
    const { count } = await this.db.cartItem.updateMany({
      where: { id: storedLineId(cartId, lineId), cartId },
      data: { quantity },
    });

    if (count > 0) await this.touch(cartId);
    return count > 0;
  }

  async removeLine(cartId: string, lineId: string): Promise<boolean> {
    // A hard delete, and allowed to be: `cart_items` has no `deletedAt`, which is the
    // schema stating that a removed line is not an event worth reconstructing.
    const { count } = await this.db.cartItem.deleteMany({
      where: { id: storedLineId(cartId, lineId), cartId },
    });

    if (count > 0) await this.touch(cartId);
    return count > 0;
  }

  async clear(cartId: string): Promise<void> {
    await this.db.cartItem.deleteMany({ where: { cartId } });
    await this.db.cart.softDelete({ where: { id: cartId } });
  }

  /**
   * The vendor snapshot, through `CatalogReaderPort`.
   *
   * Reading `vendors` here with a private `select` would be quicker to write and would give
   * the same table two owners — the point of the port. It also means the cart inherits the
   * catalog's definition of listable: an inactive vendor, or one with no primary branch, is
   * `null` here exactly as it is in the directory.
   */
  async loadVendorSnapshot(vendorId: string): Promise<CartVendorRecord | null> {
    const vendor = await this.catalog.findVendorById(vendorId);
    if (!vendor) return null;

    return {
      id: vendor.id,
      slug: vendor.slug,
      name: vendor.name,
      currency: vendor.currency,
      countryCode: vendor.location.countryCode,
      deliveryFee: vendor.deliveryFee,
      minOrder: vendor.minOrder,
      freeDeliveryOver: vendor.freeDeliveryOver,
    };
  }

  // --- internals ------------------------------------------------------------

  private async reviveOrCreate(
    owner: CartOwner,
    vendorId: string,
    currency: string,
  ): Promise<CartState> {
    /**
     * `deletedAt: undefined` is the opt-out, and it works on *key presence* rather than
     * value: the soft-delete extension leaves a `where` alone when the caller mentions
     * `deletedAt` at all (`'deletedAt' in where`), while Prisma ignores an `undefined`
     * value. So this reads live and tombstoned rows alike — which is the whole point,
     * since the row blocking the insert is precisely the tombstoned one.
     */
    const existing = await this.db.cart.findFirst({
      where: { ...ownerWhere(owner), vendorId, deletedAt: undefined },
      select: CART_SELECT,
    });

    if (existing) {
      await this.db.cart.update({
        where: { id: existing.id },
        data: { deletedAt: null, currency, expiresAt: this.expiry() },
      });
      // A revived cart must not carry the lines it was abandoned with: those were priced
      // against a menu that is now weeks old, and the customer discarded them.
      await this.db.cartItem.deleteMany({ where: { cartId: existing.id } });

      return { id: existing.id, vendorId, lines: [], updatedAt: this.clock.date() };
    }

    const created = await this.db.cart.create({
      data: {
        id: this.ids.next('cart'),
        ...ownerData(owner),
        vendorId,
        currency,
        expiresAt: this.expiry(),
      },
      select: CART_SELECT,
    });

    return toState(created);
  }

  /**
   * Pushes `expiresAt` out on every write.
   *
   * `@updatedAt` already tracks the last change, so this is not bookkeeping — it is the
   * column a sweeper will read, and a cart that is being used should not be eligible for
   * collection. Nothing sweeps yet; stamping it now means the sweeper, when it arrives,
   * does not have to guess about carts written before it existed.
   */
  private async touch(cartId: string): Promise<void> {
    await this.db.cart.update({
      where: { id: cartId },
      data: { expiresAt: this.expiry() },
    });
  }

  private expiry(): Date {
    return new Date(this.clock.now() + this.config.ttlHours * 3_600_000);
  }
}

/**
 * An owner as a `where` clause.
 *
 * An authenticated owner matches on `userId` alone — never on `userId` *and* `guestKey`.
 * The guest key is a hint for adoption, not part of the identity: if it were both, a
 * customer who signed in on a second device would be shown an empty cart, because their
 * cart's `guestKey` came from the first browser.
 */
function ownerWhere(owner: CartOwner): Prisma.CartWhereInput {
  return owner.userId ? { userId: owner.userId } : { userId: null, guestKey: owner.guestKey };
}

function ownerData(owner: CartOwner): { userId: string | null; guestKey: string | null } {
  return owner.userId
    ? { userId: owner.userId, guestKey: owner.guestKey ?? null }
    : { userId: null, guestKey: owner.guestKey ?? null };
}

const CART_SELECT = Prisma.validator<Prisma.CartSelect>()({
  id: true,
  vendorId: true,
  updatedAt: true,
  items: {
    // `createdAt` and not `id`: a cart should read in the order things were put in it,
    // and the id is a hash of the configuration, so ordering by it would shuffle the
    // basket every time an option changed.
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      foodId: true,
      name: true,
      image: true,
      basePrice: true,
      unitPrice: true,
      quantity: true,
      options: {
        orderBy: { optionId: 'asc' },
        select: { groupId: true, optionId: true, name: true, priceDelta: true },
      },
    },
  },
});

type CartRow = Prisma.CartGetPayload<{ select: typeof CART_SELECT }>;

function toState(row: CartRow): CartState {
  return {
    id: row.id,
    vendorId: row.vendorId,
    updatedAt: row.updatedAt,
    lines: row.items.map((item) => ({
      // Back to the bare line id the frontend has used since Phase C.
      id: toWireLineId(row.id, item.id),
      foodId: item.foodId,
      name: item.name,
      image: item.image,
      basePrice: item.basePrice.toNumber(),
      unitPrice: item.unitPrice.toNumber(),
      quantity: item.quantity,
      options: item.options.map((option) => ({
        groupId: option.groupId,
        optionId: option.optionId,
        name: option.name,
        priceDelta: option.priceDelta.toNumber(),
      })),
    })),
  };
}
