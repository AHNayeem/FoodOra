import type { VendorType } from '../../../../shared/enums';
import type {
  CategoryRecord,
  CuisineRecord,
  FoodItemRecord,
  MenuSectionWithItemsRecord,
  VendorRecord,
} from '../models';
import type { CatalogReaderPort } from './catalog-reader.port';

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

/**
 * What SQL can narrow, and nothing else.
 *
 * `openNow` and the two relation-dependent sorts are absent on purpose — see
 * `policies/listing.ts`. Keeping them out of the port means the port describes what
 * the database is actually asked, so nobody later adds an `openNow` parameter that
 * the implementation would have to silently ignore.
 */
export interface VendorCandidateFilter {
  type?: VendorType;
  cuisineId?: string;
  /** Case-insensitive substring of the name or the tagline. */
  search?: string;
  /** `CATALOG_CANDIDATE_LIMIT` — the application layer finishes the job. */
  limit: number;
}

export interface CatalogRepositoryPort extends CatalogReaderPort {
  listCuisines(): Promise<CuisineRecord[]>;
  listCategories(): Promise<CategoryRecord[]>;

  /**
   * Active, non-deleted vendors with their primary branch already folded in, ordered
   * by rating so a truncated candidate set is at least the *best* rows rather than an
   * arbitrary ones. Vendors with no primary branch are skipped: the frontend's
   * `Vendor` has no nullable location, and a storefront with nowhere to deliver from
   * is not listable.
   */
  listVendorCandidates(filter: VendorCandidateFilter): Promise<VendorRecord[]>;

  findVendorBySlug(slug: string): Promise<VendorRecord | null>;
  listVendorsByFlag(flag: 'featured' | 'trending', limit: number): Promise<VendorRecord[]>;

  /** Sections of the vendor's default delivery menu, each with its available dishes. */
  listVendorMenu(vendorId: string): Promise<MenuSectionWithItemsRecord[]>;
  listPopularFoods(vendorId: string, limit: number): Promise<FoodItemRecord[]>;
  findFoodBySlug(slug: string): Promise<FoodItemRecord | null>;

  /**
   * The two by-id lookups are inherited from `CatalogReaderPort` rather than declared
   * here, so the cart can be handed the narrow interface while this one stays the full
   * surface. Same implementation, two views of it.
   */
}
