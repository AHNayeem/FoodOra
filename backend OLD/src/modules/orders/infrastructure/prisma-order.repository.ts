import { Injectable } from '@nestjs/common';

import { IdService } from '../../../common/ids';
import { enumCodec, TransactionManager } from '../../../infrastructure/prisma';
import { $Enums, Prisma } from '../../../infrastructure/prisma/generated';
import {
  type CouponKind,
  type FulfillmentType,
  type OrderActor,
  type OrderCancelReason,
  ORDER_STATUSES,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type RefundStatus,
} from '../../../shared/enums';
import type { CartLineRecord, CartVendorRecord } from '../../cart/domain';
import {
  formatOrderNumber,
  type NewOrder,
  ORDER_NUMBER_SCOPE,
  type OrderRepositoryPort,
  type CouponRecord,
  type PlacedOrder,
  type TaxRuleRecord,
} from '../domain';

const orderStatuses = enumCodec<OrderStatus, $Enums.OrderStatusKind>('OrderStatusKind');
const orderActors = enumCodec<OrderActor, $Enums.OrderActorKind>('OrderActorKind');
const fulfillments = enumCodec<FulfillmentType, $Enums.FulfillmentKind>('FulfillmentKind');
const paymentMethods = enumCodec<PaymentMethod, $Enums.PaymentMethodKind>('PaymentMethodKind');
const paymentStatuses = enumCodec<PaymentStatus, $Enums.PaymentStatusKind>('PaymentStatusKind');
const cancelReasons = enumCodec<OrderCancelReason, $Enums.OrderCancelReasonKind>(
  'OrderCancelReasonKind',
);
const refundStatuses = enumCodec<RefundStatus, $Enums.RefundStatusKind>('RefundStatusKind');
const couponKinds = enumCodec<CouponKind, $Enums.DiscountKind>('DiscountKind');

/**
 * The only file in the orders module that knows Prisma exists.
 *
 * The E3 conventions hold — nothing here opens a transaction, `Decimal` does not leave
 * this file, the soft-delete extension filters only the top-level `where`. Four things are
 * specific to orders and each is a decision:
 *
 * **The order number comes from a row lock, not from the clock.** `number_sequences` is
 * incremented with `UPDATE … RETURNING` inside the caller's transaction, so two
 * simultaneous checkouts serialise on the row instead of colliding on a `@unique` column.
 * See `policies/order-number.ts` for why a timestamp was not good enough.
 *
 * **`lineKey` preserves the cart's composite line id.** `order_items.id` is a minted `oli_`
 * id — an order item genuinely is an entity with a lifetime, unlike a cart line — but the
 * frontend's `Order.lines[].id` has always been the composite configuration key, and the
 * confirmation screen renders the same lines the basket did. Storing both means the read
 * model can hand back the id the frontend expects without deriving it.
 *
 * **The lifecycle is flattened on the way in and recomposed on the way out.** Postgres has
 * `prepMinutes`, `otpHash`, `refundStatus` as columns because "every order that blew its
 * promised time" should be an indexed query rather than a JSON scan; the frontend has them
 * nested under `lifecycle` because that is how it has read them since Phase C. This file is
 * the only place allowed to know they are the same thing.
 *
 * **The vendor snapshot is stored *and* the vendor is joined.** `vendorSnapshot` is what
 * the receipt must show — the fee and threshold as they were when the order was placed —
 * and it is what the read model returns. The `vendorId` foreign key exists for the
 * merchant board's indexes. Neither one replaces the other.
 */
@Injectable()
export class PrismaOrderRepository implements OrderRepositoryPort {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly ids: IdService,
  ) {}

  private get db() {
    return this.transactions.client;
  }

  async createOrder(order: NewOrder): Promise<PlacedOrder> {
    const orderId = this.ids.next('order');
    const orderNumber = formatOrderNumber(await this.nextSequence());
    const branchId = order.branchId ?? (await this.primaryBranchId(order.vendorId));

    await this.db.order.create({
      data: {
        id: orderId,
        orderNumber,
        userId: order.userId,
        vendorId: order.vendorId,
        branchId,
        vendorSnapshot: order.vendorSnapshot as Prisma.InputJsonValue,
        addressSnapshot: (order.address ?? undefined) as Prisma.InputJsonValue | undefined,
        // Denormalised from the address snapshot so dispatch and zone analytics can filter
        // without opening the JSON. Null for pickup, which has no destination.
        deliveryArea: order.address?.area ?? null,
        deliveryCity: order.address?.city ?? null,

        fulfillment: fulfillments.toDb(order.fulfillment),
        scheduledFor: order.scheduledFor,
        contactName: order.contact.name,
        contactPhone: order.contact.phone,
        notes: order.notes,

        paymentMethod: paymentMethods.toDb(order.paymentMethod),
        paymentStatus: paymentStatuses.toDb(order.paymentStatus),
        cardLast4: order.cardLast4,

        currency: order.pricing.currency,
        subtotal: new Prisma.Decimal(order.pricing.subtotal),
        deliveryFee: new Prisma.Decimal(order.pricing.deliveryFee),
        discount: new Prisma.Decimal(order.pricing.discount),
        couponCode: order.pricing.couponCode,
        couponId: order.couponId,
        tax: new Prisma.Decimal(order.pricing.tax),
        taxLabel: order.pricing.taxLabel,
        taxRate: new Prisma.Decimal(order.pricing.taxRate),
        tip: new Prisma.Decimal(order.pricing.tip),
        total: new Prisma.Decimal(order.pricing.total),

        status: orderStatuses.toDb('placed'),
        placedAt: order.placedAt,
        estimatedDeliveryAt: order.estimatedDeliveryAt,
        otpHash: order.otpHash,
        itemCount: order.lines.reduce((count, line) => count + line.quantity, 0),

        items: {
          create: order.lines.map((line, index) => ({
            id: this.ids.next('orderItem'),
            foodId: line.foodId,
            lineKey: line.id,
            name: line.name,
            image: line.image,
            basePrice: new Prisma.Decimal(line.basePrice),
            unitPrice: new Prisma.Decimal(line.unitPrice),
            quantity: line.quantity,
            lineTotal: new Prisma.Decimal(round2(line.unitPrice * line.quantity)),
            sort: index,
            options: {
              create: line.options.map((option) => ({
                id: this.ids.next('orderItemOption'),
                groupId: option.groupId,
                optionId: option.optionId,
                name: option.name,
                priceDelta: new Prisma.Decimal(option.priceDelta),
              })),
            },
          })),
        },

        /**
         * The first lifecycle event, written with the order rather than after it.
         *
         * `order_events` is append-only and is the only honest source for the timeline, so
         * an order whose log starts at "confirmed" would be an order that was never placed.
         * Same transaction, same statement, no window in which one exists without the other.
         */
        events: {
          create: {
            id: this.ids.next('orderEvent'),
            status: orderStatuses.toDb('placed'),
            at: order.placedAt,
            actor: orderActors.toDb('customer'),
            actorId: order.userId,
          },
        },
      },
    });

    const created = await this.readOrder(orderId);
    if (!created) {
      // Unreachable: the row was created in this transaction. Throwing beats returning a
      // shape that claims an order exists when the read that would prove it came back empty.
      throw new Error(`Order ${orderId} could not be read back after creation.`);
    }
    return created;
  }

  /**
   * `userId` is part of the `where`, so a stranger's order and a nonexistent one produce
   * the identical `null`. Two code paths that differed would leak which ids are real.
   */
  async findOrderById(orderId: string, userId: string): Promise<PlacedOrder | null> {
    const row = await this.db.order.findFirst({
      where: { id: orderId, userId },
      select: ORDER_SELECT,
    });
    return row ? toPlacedOrder(row) : null;
  }

  /**
   * The most specific live rule, resolved in code rather than in SQL.
   *
   * One indexed read returns every candidate for this country — there are single digits of
   * them per country in any realistic configuration — and the narrowing is a sort. The
   * alternative, a query per scope level with a fallback chain, is three round trips to
   * answer a question one can.
   *
   * `appliesTo: ORDER_SUBTOTAL` is the only rule V1 applies. `tax_rules` also models
   * levies on the delivery fee, the service charge and packaging, and honouring those means
   * the pricing policy grows a term per category; the prototype has always taxed the
   * subtotal alone, so that is what this reproduces.
   */
  async resolveTaxRule(input: {
    countryCode: string;
    city: string | null;
    vendorId: string;
    at: Date;
  }): Promise<TaxRuleRecord | null> {
    const candidates = await this.db.taxRule.findMany({
      where: {
        countryCode: input.countryCode,
        appliesTo: $Enums.TaxAppliesTo.ORDER_SUBTOTAL,
        effectiveFrom: { lte: input.at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.at } }],
      },
      select: { label: true, rate: true, city: true, vendorId: true, priority: true },
    });

    const applicable = candidates.filter(
      (rule) =>
        (rule.vendorId === null || rule.vendorId === input.vendorId) &&
        (rule.city === null || rule.city === input.city),
    );
    if (applicable.length === 0) return null;

    // vendor beats city beats country; an explicit `priority` breaks a tie between two
    // rules at the same level, which is how a temporary override is expressed.
    applicable.sort((a, b) => specificity(b) - specificity(a) || b.priority - a.priority);
    const winner = applicable[0];

    return { label: winner.label, rate: winner.rate.toNumber() };
  }

  async findCouponByCode(code: string): Promise<CouponRecord | null> {
    const row = await this.db.coupon.findUnique({
      where: { code },
      select: COUPON_SELECT,
    });
    if (!row) return null;

    return {
      id: row.id,
      code: row.code,
      title: row.title,
      kind: couponKinds.toWire(row.kind),
      value: row.value.toNumber(),
      maxDiscount: row.maxDiscount?.toNumber() ?? null,
      minOrder: row.minOrder.toNumber(),
      currency: row.currency,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      usageLimit: row.usageLimit,
      totalLimit: row.totalLimit,
      totalRedeemed: row.totalRedeemed,
      firstOrderOnly: row.firstOrderOnly,
      vendorIds: row.vendors.map((link) => link.vendorId),
      categorySlugs: row.categories.map((link) => link.category.slug),
    };
  }

  /**
   * Both limits, from `orders`.
   *
   * `SPENT_STATUSES` is the definition of "used": everything except the two ways an order
   * ends without anybody being fed. Two counts rather than one query because they answer
   * different questions — the customer's own usage limit and the platform-wide cap — and a
   * `groupBy` returning both would be harder to read than two `count`s that say what they
   * mean.
   */
  async countCouponUse(couponId: string, userId: string): Promise<{ byUser: number; total: number }> {
    const [byUser, total] = await Promise.all([
      this.db.order.count({ where: { couponId, userId, status: { in: SPENT_STATUSES } } }),
      this.db.order.count({ where: { couponId, status: { in: SPENT_STATUSES } } }),
    ]);
    return { byUser, total };
  }

  async hasPlacedOrder(userId: string): Promise<boolean> {
    const existing = await this.db.order.findFirst({ where: { userId }, select: { id: true } });
    return existing !== null;
  }

  // --- internals ------------------------------------------------------------

  /**
   * `UPDATE … SET current = current + 1 RETURNING current`, creating the row on first use.
   *
   * `upsert` rather than a read-then-write: the increment has to happen in one statement or
   * two concurrent checkouts both read 41 and both write 42.
   */
  private async nextSequence(): Promise<bigint> {
    const row = await this.db.numberSequence.upsert({
      where: { scope: ORDER_NUMBER_SCOPE },
      create: { scope: ORDER_NUMBER_SCOPE, current: 1n },
      update: { current: { increment: 1n } },
      select: { current: true },
    });
    return row.current;
  }

  /**
   * The vendor's primary branch, because the kitchen board is per branch.
   *
   * Null is tolerated rather than fatal: an order with no branch is still a valid order and
   * still appears on the vendor-scoped views. The catalog refuses to list a vendor without
   * a primary branch, so in practice this is only null for data that predates that rule.
   */
  private async primaryBranchId(vendorId: string): Promise<string | null> {
    const branch = await this.db.vendorBranch.findFirst({
      where: { vendorId, isPrimary: true },
      select: { id: true },
    });
    return branch?.id ?? null;
  }

  private async readOrder(orderId: string): Promise<PlacedOrder | null> {
    const row = await this.db.order.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
    return row ? toPlacedOrder(row) : null;
  }
}

/** vendor-scoped 2, city-scoped 1, country-wide 0. */
function specificity(rule: { vendorId: string | null; city: string | null }): number {
  if (rule.vendorId !== null) return 2;
  if (rule.city !== null) return 1;
  return 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const COUPON_SELECT = Prisma.validator<Prisma.CouponSelect>()({
  id: true,
  code: true,
  title: true,
  kind: true,
  value: true,
  maxDiscount: true,
  minOrder: true,
  currency: true,
  startsAt: true,
  endsAt: true,
  usageLimit: true,
  totalLimit: true,
  totalRedeemed: true,
  firstOrderOnly: true,
  vendors: { select: { vendorId: true } },
  // The slug, not the id: `frontend/types/coupon.ts::Coupon.categorySlugs` is what the
  // engine's rule is written against, and a coupon's scope is authored as slugs.
  categories: { select: { category: { select: { slug: true } } } },
});

/**
 * The order statuses that count as having spent a coupon.
 *
 * Everything except `cancelled` and `rejected` — the two endings where no food was made
 * and no money was taken, so the ticket goes back in the wallet.
 */
const SPENT_STATUSES = ORDER_STATUSES.filter(
  (status) => status !== 'cancelled' && status !== 'rejected',
).map((status) => orderStatuses.toDb(status));

const ORDER_SELECT = Prisma.validator<Prisma.OrderSelect>()({
  id: true,
  orderNumber: true,
  vendorSnapshot: true,
  addressSnapshot: true,
  fulfillment: true,
  scheduledFor: true,
  contactName: true,
  contactPhone: true,
  notes: true,
  paymentMethod: true,
  paymentStatus: true,
  cardLast4: true,
  currency: true,
  subtotal: true,
  deliveryFee: true,
  discount: true,
  couponCode: true,
  tax: true,
  taxLabel: true,
  taxRate: true,
  tip: true,
  total: true,
  status: true,
  placedAt: true,
  estimatedDeliveryAt: true,
  prepMinutes: true,
  promisedReadyAt: true,
  delayMinutes: true,
  rejectionReason: true,
  cancelReason: true,
  cancelledBy: true,
  failureReason: true,
  assignedAt: true,
  otpAttempts: true,
  otpVerifiedAt: true,
  refundStatus: true,
  refundAmount: true,
  rating: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  items: {
    orderBy: { sort: 'asc' },
    select: {
      lineKey: true,
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
  events: {
    orderBy: { at: 'asc' },
    select: { id: true, status: true, at: true, actor: true, note: true },
  },
  riderDeclines: { select: { riderId: true } },
});

type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

function toPlacedOrder(row: OrderRow): PlacedOrder {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    // Written by this module from a `CartVendorRecord`, so the cast is reading back what
    // was put in. A snapshot is exactly the case where a stored shape cannot be re-derived.
    vendor: row.vendorSnapshot as unknown as CartVendorRecord,
    lines: row.items.map(toLine),
    fulfillment: fulfillments.toWire(row.fulfillment),
    address: (row.addressSnapshot as PlacedOrder['address']) ?? null,
    scheduledFor: row.scheduledFor,
    contact: { name: row.contactName, phone: row.contactPhone },
    notes: row.notes,
    payment: {
      method: paymentMethods.toWire(row.paymentMethod),
      status: paymentStatuses.toWire(row.paymentStatus),
      cardLast4: row.cardLast4,
    },
    pricing: {
      currency: row.currency,
      subtotal: row.subtotal.toNumber(),
      deliveryFee: row.deliveryFee.toNumber(),
      discount: row.discount.toNumber(),
      couponCode: row.couponCode,
      tax: row.tax.toNumber(),
      taxLabel: row.taxLabel,
      taxRate: row.taxRate.toNumber(),
      tip: row.tip.toNumber(),
      total: row.total.toNumber(),
    },
    status: orderStatuses.toWire(row.status),
    placedAt: row.placedAt,
    estimatedDeliveryAt: row.estimatedDeliveryAt,
    lifecycle: {
      events: row.events.map((event) => ({
        id: event.id,
        status: orderStatuses.toWire(event.status),
        at: event.at,
        actor: orderActors.toWire(event.actor),
        note: event.note,
      })),
      prepMinutes: row.prepMinutes,
      promisedReadyAt: row.promisedReadyAt,
      delayMinutes: row.delayMinutes,
      rejectionReason: row.rejectionReason ? cancelReasons.toWire(row.rejectionReason) : null,
      cancelReason: row.cancelReason ? cancelReasons.toWire(row.cancelReason) : null,
      cancelledBy: row.cancelledBy ? orderActors.toWire(row.cancelledBy) : null,
      failureReason: row.failureReason ? cancelReasons.toWire(row.failureReason) : null,
      rider: null,
      assignment: null,
      assignedAt: row.assignedAt,
      rejectedRiderIds: row.riderDeclines.map((decline) => decline.riderId),
      // Filled by the service from Redis when it still has it; Postgres holds only the hash.
      otp: '',
      otpAttempts: row.otpAttempts,
      otpVerifiedAt: row.otpVerifiedAt,
      refund: refundStatuses.toWire(row.refundStatus),
      refundAmount: row.refundAmount.toNumber(),
      rating: row.rating,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toLine(item: OrderRow['items'][number]): CartLineRecord {
  return {
    // The composite configuration key the frontend has used since Phase C — not the
    // minted `oli_` primary key, which the frontend has never seen.
    id: item.lineKey,
    foodId: item.foodId ?? '',
    name: item.name,
    image: item.image,
    basePrice: item.basePrice.toNumber(),
    unitPrice: item.unitPrice.toNumber(),
    quantity: item.quantity,
    options: item.options.map((option) => ({
      groupId: option.groupId,
      optionId: option.optionId ?? '',
      name: option.name,
      priceDelta: option.priceDelta.toNumber(),
    })),
  };
}
