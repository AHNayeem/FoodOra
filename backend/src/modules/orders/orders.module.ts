import { Module, type OnModuleInit } from '@nestjs/common';

import { assertVocabularyMatches } from '../../infrastructure/prisma';
import {
  COUPON_KINDS,
  FULFILLMENT_TYPES,
  ORDER_ACTORS,
  ORDER_CANCEL_REASONS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
} from '../../shared/enums';
import { CartModule } from '../cart/cart.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CheckoutService } from './application/checkout.service';
import { HANDOFF_CACHE, HANDOFF_CODE, ORDER_REPOSITORY } from './domain';
import { NodeHandoffCode } from './infrastructure/node-handoff-code';
import { PrismaOrderRepository } from './infrastructure/prisma-order.repository';
import { RedisHandoffCache } from './infrastructure/redis-handoff-cache';
import { CheckoutResolver } from './presentation/checkout.resolver';

/**
 * Checkout: pricing a basket and turning it into an order.
 *
 * Two module imports, each supplying exactly one narrow port:
 *
 * - **`CartModule` → `CART_CHECKOUT`** — read the basket, price its vendor, consume it, and
 *   adopt a guest's onto an account. Not `CartService`, which the dependency rule forbids
 *   and which would hand checkout the ability to add items to a basket it is about to close.
 * - **`CatalogModule` → `CATALOG_READER`** — one lookup, for `isOpen`. A closed kitchen does
 *   not block filling a basket and does block ordering one for right now, and only the
 *   module that owns opening hours can answer that.
 *
 * `exports` is empty. The units that follow — the restaurant board, delivery — will need to
 * read and transition orders, and they will get the same treatment: a port declared in
 * `orders/domain/ports/`, not the service handed out whole.
 */
@Module({
  imports: [CartModule, CatalogModule],
  providers: [
    CheckoutService,
    CheckoutResolver,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: HANDOFF_CODE, useClass: NodeHandoffCode },
    { provide: HANDOFF_CACHE, useClass: RedisHandoffCache },
  ],
})
export class OrdersModule implements OnModuleInit {
  /**
   * Eight vocabularies, eight Postgres enums, two hand-maintained lists of the same facts.
   *
   * Checked at boot so a member added to the schema but not to the union — or the reverse —
   * fails the startup with a diff in it, rather than throwing on the one order months later
   * that happens to reach the value nobody mapped. `payment_method_kind` is the live example:
   * it carries `mfs` and `netbanking` that the checkout screen never offers, and this check
   * is why the vocabulary has to admit them rather than quietly disagreeing.
   */
  onModuleInit(): void {
    assertVocabularyMatches('OrderStatusKind', ORDER_STATUSES);
    assertVocabularyMatches('OrderActorKind', ORDER_ACTORS);
    assertVocabularyMatches('FulfillmentKind', FULFILLMENT_TYPES);
    assertVocabularyMatches('PaymentMethodKind', PAYMENT_METHODS);
    assertVocabularyMatches('PaymentStatusKind', PAYMENT_STATUSES);
    assertVocabularyMatches('OrderCancelReasonKind', ORDER_CANCEL_REASONS);
    assertVocabularyMatches('RefundStatusKind', REFUND_STATUSES);
    assertVocabularyMatches('DiscountKind', COUPON_KINDS);
  }
}
