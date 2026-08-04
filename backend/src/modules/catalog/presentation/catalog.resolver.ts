import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';

import { Public } from '../../../common/decorators';
import { type IPage, PageInput } from '../../../common/pagination';
import { zodPipe } from '../../../common/pipes';
import { CatalogService } from '../application/catalog.service';
import type { CategoryRecord, CuisineRecord, FoodItemRecord, MenuSectionWithItemsRecord, VendorRecord } from '../domain';
import { VendorQueryInput, VendorQuerySchema } from './inputs/catalog.inputs';
import {
  CategoryModel,
  CuisineModel,
  FoodItemModel,
  MenuSectionWithItemsModel,
  VendorModel,
  VendorPage,
} from './models/catalog.models';

/**
 * The catalog read surface — seven queries, all `@Public()`.
 *
 * Public is the entire point rather than an oversight. The landing page, the
 * restaurant directory and a restaurant's menu are what a search engine indexes and
 * what a first-time visitor sees; a catalog that required a token would mean the only
 * way to find out what the platform sells is to already have an account. The guard
 * chain is global (E2), so *omitting* `@Public()` here is what would break the site.
 *
 * There are no mutations. Menu editing is the merchant dashboard's, and it arrives
 * with the unit that owns the vendor side — Unit 1 replaces the mock **read** layer
 * and nothing else, so a write here would be surface with no caller.
 */
@Resolver()
export class CatalogResolver {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Query(() => [CuisineModel], {
    name: 'cuisines',
    description: 'Cuisines in display order. Replaces lib/mock/cuisines.ts.',
  })
  async cuisines(): Promise<CuisineRecord[]> {
    return this.catalog.cuisines();
  }

  @Public()
  @Query(() => [CategoryModel], {
    name: 'categories',
    description: 'The craving rail, in display order. Replaces lib/mock/categories.ts.',
  })
  async categories(): Promise<CategoryRecord[]> {
    return this.catalog.categories();
  }

  @Public()
  @Query(() => VendorPage, {
    name: 'vendors',
    description: 'The restaurant directory: filtered, sorted and paged. Replaces catalog.getVendors.',
  })
  async vendors(
    @Args('query', { type: () => VendorQueryInput, nullable: true }, zodPipe(VendorQuerySchema.optional()))
    query: VendorQueryInput | undefined,
    @Args('page', { type: () => PageInput, nullable: true }) page?: PageInput,
  ): Promise<IPage<VendorRecord>> {
    return this.catalog.listVendors(query ?? {}, page);
  }

  @Public()
  @Query(() => VendorModel, {
    name: 'vendor',
    nullable: true,
    description: 'One storefront by slug. Null when unknown, deleted or not active.',
  })
  async vendor(@Args('slug', { type: () => String }) slug: string): Promise<VendorRecord | null> {
    return this.catalog.vendorBySlug(slug);
  }

  @Public()
  @Query(() => [VendorModel], { name: 'trendingVendors', description: 'The home page’s trending rail.' })
  async trendingVendors(
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 8 }) limit: number,
  ): Promise<VendorRecord[]> {
    return this.catalog.trendingVendors(limit);
  }

  @Public()
  @Query(() => [VendorModel], { name: 'featuredVendors', description: 'Editorially featured storefronts.' })
  async featuredVendors(
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 6 }) limit: number,
  ): Promise<VendorRecord[]> {
    return this.catalog.featuredVendors(limit);
  }

  @Public()
  @Query(() => [MenuSectionWithItemsModel], {
    name: 'vendorMenu',
    description: 'A vendor’s delivery menu — sections in order, each with its dishes. Empty sections are dropped.',
  })
  async vendorMenu(
    @Args('vendorId', { type: () => ID }) vendorId: string,
  ): Promise<MenuSectionWithItemsRecord[]> {
    return this.catalog.vendorMenu(vendorId);
  }

  @Public()
  @Query(() => [FoodItemModel], {
    name: 'popularItems',
    description: 'The "Popular" rail on a restaurant page.',
  })
  async popularItems(
    @Args('vendorId', { type: () => ID }) vendorId: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 6 }) limit: number,
  ): Promise<FoodItemRecord[]> {
    return this.catalog.popularItems(vendorId, limit);
  }

  @Public()
  @Query(() => FoodItemModel, { name: 'food', nullable: true, description: 'One dish by slug.' })
  async food(@Args('slug', { type: () => String }) slug: string): Promise<FoodItemRecord | null> {
    return this.catalog.foodBySlug(slug);
  }
}
