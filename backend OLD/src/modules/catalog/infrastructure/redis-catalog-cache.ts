import { Inject, Injectable } from '@nestjs/common';

import { catalogConfig, type CatalogConfig } from '../../../config';
import { CacheService } from '../../../infrastructure/redis';
import type {
  CatalogCachePort,
  CatalogSnapshot,
  FoodItemRecord,
  MenuSectionWithItemsRecord,
} from '../domain';

const RAILS_KEY = 'catalog:rails';
const menuKey = (vendorId: string) => `catalog:menu:${vendorId}`;
const foodKey = (slug: string) => `catalog:food:${slug}`;

/**
 * Redis behind `CatalogCachePort`. The port argues *what* is cached and what is not;
 * this file only knows how to store it.
 *
 * Two rules run through every method here:
 *
 * **A TTL of zero means "do not cache".** Not "cache forever" — that inversion is a
 * classic and it fails in the worst direction. It is the switch that lets someone bisect
 * a suspected staleness bug in production without a deploy, which means the *read* path
 * has to honour it too: an entry written before the TTL was zeroed must stop being
 * served, not linger until it expires.
 *
 * **Dates are rehydrated, never trusted.** `JSON.parse` returns strings where `Date`s
 * went in, so `createdAt` on a cached record would be a string while the same field on
 * an uncached one is a `Date`. The DateTime scalar serialises either, so nothing fails —
 * until something does arithmetic on it and renders `Invalid Date`, on precisely the
 * second page view.
 */
@Injectable()
export class RedisCatalogCache implements CatalogCachePort {
  constructor(
    private readonly cache: CacheService,
    @Inject(catalogConfig.KEY) private readonly config: CatalogConfig,
  ) {}

  // --- browse rails ---------------------------------------------------------

  async read(): Promise<CatalogSnapshot | null> {
    if (this.config.cache.railsTtlSeconds === 0) return null;

    const cached = await this.cache.get<CatalogSnapshot>(RAILS_KEY);
    if (!cached) return null;
    return {
      cuisines: cached.cuisines.map(reviveEntity),
      categories: cached.categories.map(reviveEntity),
    };
  }

  async write(snapshot: CatalogSnapshot): Promise<void> {
    const ttl = this.config.cache.railsTtlSeconds;
    if (ttl === 0) return;
    await this.cache.set(RAILS_KEY, snapshot, ttl);
  }

  async invalidate(): Promise<void> {
    await this.cache.del(RAILS_KEY);
  }

  // --- menus ----------------------------------------------------------------

  async readMenu(vendorId: string): Promise<MenuSectionWithItemsRecord[] | null> {
    if (this.config.cache.menuTtlSeconds === 0) return null;

    const cached = await this.cache.get<MenuSectionWithItemsRecord[]>(menuKey(vendorId));
    if (!cached) return null;
    return cached.map((section) => ({
      ...reviveEntity(section),
      items: section.items.map(reviveEntity),
    }));
  }

  async writeMenu(
    vendorId: string,
    sections: readonly MenuSectionWithItemsRecord[],
  ): Promise<void> {
    const ttl = this.config.cache.menuTtlSeconds;
    if (ttl === 0) return;
    await this.cache.set(menuKey(vendorId), sections, ttl);
  }

  // --- dishes ---------------------------------------------------------------

  async readFood(slug: string): Promise<FoodItemRecord | null> {
    if (this.config.cache.menuTtlSeconds === 0) return null;

    const cached = await this.cache.get<FoodItemRecord>(foodKey(slug));
    return cached ? reviveEntity(cached) : null;
  }

  async writeFood(slug: string, food: FoodItemRecord): Promise<void> {
    const ttl = this.config.cache.menuTtlSeconds;
    if (ttl === 0) return;
    await this.cache.set(foodKey(slug), food, ttl);
  }

  async invalidateVendor(vendorId: string, foodSlugs: readonly string[] = []): Promise<void> {
    await Promise.all([
      this.cache.del(menuKey(vendorId)),
      ...foodSlugs.map((slug) => this.cache.del(foodKey(slug))),
    ]);
  }
}

/**
 * `CatalogEntity`'s three timestamps, back to `Date`.
 *
 * Constrained structurally rather than to `CatalogEntity` so it applies to a section and
 * to a dish without a cast — both satisfy it, and neither has to know the other does.
 */
function reviveEntity<T extends { createdAt: unknown; updatedAt: unknown; deletedAt: unknown }>(
  row: T,
): T {
  return {
    ...row,
    createdAt: new Date(row.createdAt as string),
    updatedAt: new Date(row.updatedAt as string),
    deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt as string),
  };
}
