import { Inject, Injectable, Logger } from '@nestjs/common';

import { catalogConfig, type CatalogConfig } from '../../../config';
import { buildPage, type IPage, type PageInput, toSkipTake } from '../../../common/pagination';
import { ROUTING_PROVIDER, type RoutingProviderPort } from '../../../shared/contracts';
import {
  CATALOG_CACHE,
  type CatalogCachePort,
  CATALOG_REPOSITORY,
  type CatalogRepositoryPort,
  type CategoryRecord,
  clampRailLimit,
  compareVendors,
  type CuisineRecord,
  type FoodItemRecord,
  matchesOpenNow,
  type MenuSectionWithItemsRecord,
  type VendorQuery,
  type VendorRecord,
} from '../domain';

/**
 * The catalog read side — every query `services/catalog.ts` needs, and nothing else.
 *
 * Unit 1 is reads only. There is no `CatalogAdminService` yet, and its absence is why
 * the caches have TTLs but no invalidation: nothing here can make an entry stale.
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repository: CatalogRepositoryPort,
    @Inject(CATALOG_CACHE) private readonly cache: CatalogCachePort,
    @Inject(ROUTING_PROVIDER) private readonly routing: RoutingProviderPort,
    @Inject(catalogConfig.KEY) private readonly config: CatalogConfig,
  ) {}

  // --- browse rails ---------------------------------------------------------

  async cuisines(): Promise<CuisineRecord[]> {
    return [...(await this.rails()).cuisines];
  }

  async categories(): Promise<CategoryRecord[]> {
    return [...(await this.rails()).categories];
  }

  // --- vendors --------------------------------------------------------------

  /**
   * `getVendors()`, server-side.
   *
   * The order of operations is the order the mock layer used, and it matters: filter,
   * then sort, then page. Sorting before filtering would page a list that still
   * contained rows the filter removes, so `hasMore` would promise a page that comes
   * back empty.
   */
  async listVendors(query: VendorQuery, page?: PageInput | null): Promise<IPage<VendorRecord>> {
    const window = toSkipTake(page);
    const limit = this.config.candidateLimit;

    const candidates = await this.repository.listVendorCandidates({
      type: query.type,
      cuisineId: query.cuisineId,
      search: query.search?.trim() || undefined,
      limit,
    });

    if (candidates.length === limit) {
      // Never silently. Above the cap a page is computed from a subset and `total` is a
      // floor, so the line that says so has to exist before anyone trusts the number.
      this.logger.warn(
        `Vendor query filled the ${limit}-row candidate cap (CATALOG_CANDIDATE_LIMIT); ` +
          `total is a floor and late pages may be short. Raising the limit buys time; a ` +
          `listing projection is the fix (policies/listing.ts).`,
      );
    }

    const matching = (await this.withDistance(candidates, query))
      .filter((vendor) => matchesOpenNow(vendor, query.openNow))
      .sort(compareVendors(query.sort));

    return buildPage(
      matching.slice(window.skip, window.skip + window.take),
      matching.length,
      window,
    );
  }

  async vendorBySlug(slug: string): Promise<VendorRecord | null> {
    return this.repository.findVendorBySlug(slug);
  }

  async trendingVendors(limit: number): Promise<VendorRecord[]> {
    return this.repository.listVendorsByFlag('trending', this.railLimit(limit));
  }

  async featuredVendors(limit: number): Promise<VendorRecord[]> {
    return this.repository.listVendorsByFlag('featured', this.railLimit(limit));
  }

  // --- menu -----------------------------------------------------------------

  /**
   * The vendor's menu, empty sections dropped.
   *
   * Dropping them here rather than in the component is what `services/catalog.ts`
   * already did (`menu.filter(s => s.items.length > 0)`), and it belongs on this side: a
   * section whose only dish was deleted is a heading with nothing under it, which looks
   * like a loading failure rather than an empty category.
   *
   * The cache stores the *filtered* result, so a hit and a miss return the same thing.
   * Caching the raw sections and filtering after would be marginally more reusable and
   * would mean the two paths could diverge — which is the only property that matters
   * here.
   */
  async vendorMenu(vendorId: string): Promise<MenuSectionWithItemsRecord[]> {
    const cached = await this.cache.readMenu(vendorId);
    if (cached) return cached;

    const sections = await this.repository.listVendorMenu(vendorId);
    const populated = sections.filter((section) => section.items.length > 0);

    await this.cache.writeMenu(vendorId, populated);
    return populated;
  }

  async popularItems(vendorId: string, limit: number): Promise<FoodItemRecord[]> {
    return this.repository.listPopularFoods(vendorId, this.railLimit(limit));
  }

  async foodBySlug(slug: string): Promise<FoodItemRecord | null> {
    const cached = await this.cache.readFood(slug);
    if (cached) return cached;

    const food = await this.repository.findFoodBySlug(slug);
    // A miss is not cached. Slugs come from the URL bar, so caching absence would let
    // anyone fill the keyspace with 404s — and a dish that does not exist is the one
    // lookup nobody is waiting on.
    if (food) await this.cache.writeFood(slug, food);
    return food;
  }

  // --- internals ------------------------------------------------------------

  /**
   * Stamps `distanceKm`, in **one** call to the routing provider rather than one per row.
   *
   * With haversine the difference is invisible. With any of the providers the port exists
   * for it is the difference between one matrix request and five hundred billed ones, and
   * the shape of this method is what makes swapping them a configuration change. See
   * `shared/contracts/routing.contract.ts`.
   */
  private async withDistance(
    vendors: VendorRecord[],
    query: VendorQuery,
  ): Promise<VendorRecord[]> {
    if (!query.origin || vendors.length === 0) return vendors;

    const distances = await this.routing.distanceKm(
      query.origin,
      vendors.map((vendor) => vendor.location),
    );

    return vendors.map((vendor, index) => ({
      ...vendor,
      // The port promises positional alignment and equal length. `?? 0` is the belt to
      // that braces: a provider that breaks the contract should produce a wrong label,
      // not `undefined` propagated into a comparator where it silently sorts as NaN.
      distanceKm: distances[index] ?? 0,
    }));
  }

  private railLimit(limit: number): number {
    return clampRailLimit(limit, this.config.railLimit);
  }

  private async rails() {
    const cached = await this.cache.read();
    if (cached) return cached;

    const [cuisines, categories] = await Promise.all([
      this.repository.listCuisines(),
      this.repository.listCategories(),
    ]);

    const snapshot = { cuisines, categories };
    await this.cache.write(snapshot);
    return snapshot;
  }
}
