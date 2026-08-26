import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { CartService } from './application/cart.service';
import { CART_CHECKOUT, CART_REPOSITORY } from './domain';
import { PrismaCartRepository } from './infrastructure/prisma-cart.repository';
import { CartResolver } from './presentation/cart.resolver';

/**
 * The shopping basket: one vendor, many configured lines, priced by the server.
 *
 * `CatalogModule` is the only module import, and it supplies exactly one thing —
 * `CATALOG_READER`, two by-id lookups. That is the dependency rule working as intended:
 * the cart needs to know what a dish really costs and which options it really has, and it
 * gets that from the module that owns `food_items` rather than by writing a second `select`
 * against the same table.
 *
 * ## What Unit 3 added
 *
 * `CART_CHECKOUT` — the promise made in this comment when Unit 2 shipped, now kept.
 * Checkout reads a basket through a three-method port declared in `cart/domain/ports/`,
 * not through `CartService` handed out whole. `useExisting` rather than `useClass` so
 * both tokens resolve to the *same* repository instance: two instances would mean two
 * `TransactionManager` clients, and a checkout that read the cart outside the
 * transaction it was about to clear it in.
 */
@Module({
  imports: [CatalogModule],
  providers: [
    CartService,
    CartResolver,
    { provide: CART_REPOSITORY, useClass: PrismaCartRepository },
    { provide: CART_CHECKOUT, useExisting: CART_REPOSITORY },
  ],
  exports: [CART_CHECKOUT],
})
export class CartModule {}
