import { Module, type OnModuleInit } from '@nestjs/common';

import { assertVocabularyMatches } from '../../infrastructure/prisma';
import { DIETARY_TAGS, VENDOR_TYPES, WEEKDAYS } from '../../shared/enums';
import { CatalogService } from './application/catalog.service';
import { CATALOG_CACHE, CATALOG_READER, CATALOG_REPOSITORY } from './domain';
import { PrismaCatalogRepository } from './infrastructure/prisma-catalog.repository';
import { RedisCatalogCache } from './infrastructure/redis-catalog-cache';
import { CatalogResolver } from './presentation/catalog.resolver';

/**
 * The discoverable catalog: cuisines, categories, storefronts, menus and dishes.
 *
 * Read-only, and public. Nothing here needs `AuthModule`, but the composition root
 * imports it after `AuthModule` all the same, because that is where the global guard
 * chain is registered — a module listed before it would be reachable without one, and
 * "reachable without a guard" is not something to arrange by accident even for
 * operations that are meant to be public.
 *
 * One thing is exported, and it is a token rather than a service: `CATALOG_READER`, the
 * two by-id lookups the cart needs to price a line. `useExisting` points it at the same
 * repository instance, so the reader is a *narrowed view* of it rather than a second
 * implementation — the cart can ask what a dish costs and cannot reach the other six
 * methods. `CatalogService` stays unexported: a module that wants to browse the catalog
 * is a module that should be talking to GraphQL.
 */
@Module({
  providers: [
    CatalogService,
    CatalogResolver,
    { provide: CATALOG_REPOSITORY, useClass: PrismaCatalogRepository },
    { provide: CATALOG_CACHE, useClass: RedisCatalogCache },
    { provide: CATALOG_READER, useExisting: CATALOG_REPOSITORY },
  ],
  exports: [CATALOG_READER],
})
export class CatalogModule implements OnModuleInit {
  /**
   * Three vocabularies, checked against their Postgres enums at boot.
   *
   * `VendorSort` is absent because it has no enum behind it — it is a query parameter,
   * not a stored fact. The other three are exactly the seams where a hand-written
   * union and a generated client can drift, and drift here is a `toWire` throwing on
   * one unlucky row months later rather than a failure at boot.
   */
  onModuleInit(): void {
    assertVocabularyMatches('VendorTypeKind', VENDOR_TYPES);
    assertVocabularyMatches('DietaryTagKind', DIETARY_TAGS);
    assertVocabularyMatches('WeekdayKind', WEEKDAYS);
  }
}
