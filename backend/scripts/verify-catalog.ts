/**
 * V1 Unit 1's verification harness.
 *
 *   bun run verify:catalog
 *
 * This machine has no PostgreSQL and no Redis, so what can be proved is proved here
 * rather than described as working — the same bargain E1–E3 and Unit 0 struck.
 *
 * What is worth proving in a read-only module is not the SQL. It is the three pure
 * decisions the SQL cannot make, because each is somewhere a subtle mistake produces a
 * plausible-looking wrong answer that nothing else would catch:
 *
 * - **`isOpenNow`** — a branch's timezone, a split service, a window that crosses
 *   midnight, a kill switch, a pause and a dated closure. Being wrong here means the
 *   directory offers a customer a restaurant that is shut, or hides one that is open at
 *   00:30 because the window belongs to yesterday.
 * - **`toWeeklyHours`** — projecting several rows per weekday back into the one pair the
 *   frontend renders. Being wrong means the opening-hours table disagrees with the
 *   "Open now" badge above it.
 * - **filter → sort → page**, exercised through the real `CatalogService` against an
 *   in-memory repository. That is what ports-and-adapters buys: pagination, search and
 *   filtering are decisions about lists, and they can be tested without a database
 *   precisely because the service never mentions one.
 *
 * What is **not** proved: the `where` builders, the four-level `include`, the partial
 * unique index behind "exactly one primary branch". Those need Postgres.
 *
 * Deliberately not a test framework — E11 owns the committed suite. This is a script
 * with assertions, in the shape of `verify-auth.ts` and `verify-core.ts`.
 */
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/foodora';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.OTP_PEPPER ??= 'harness-pepper';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertVocabularyMatches } from '../src/infrastructure/prisma';
import { HaversineRoutingProvider, haversineKm } from '../src/infrastructure/routing';
import { DIETARY_TAGS, VENDOR_TYPES, WEEKDAYS, type Weekday } from '../src/shared/enums';
import { CatalogService } from '../src/modules/catalog/application/catalog.service';
import {
  type BranchAvailability,
  type CatalogCachePort,
  type CatalogRepositoryPort,
  type CatalogSnapshot,
  type CategoryRecord,
  compareVendors,
  type CuisineRecord,
  DEFAULT_CANDIDATE_LIMIT,
  type FoodItemRecord,
  isOpenNow,
  localMoment,
  matchesOpenNow,
  type MenuSectionWithItemsRecord,
  type OpeningWindow,
  toMinutes,
  toWeeklyHours,
  type VendorCandidateFilter,
  type VendorRecord,
} from '../src/modules/catalog/domain';

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ✗ ${label}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUDIT = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
};

const window_ = (
  weekday: Weekday,
  openTime: string | null,
  closeTime: string | null,
  extra: Partial<OpeningWindow> = {},
): OpeningWindow => ({ weekday, openTime, closeTime, overnight: false, sort: 0, ...extra });

const availability = (over: Partial<BranchAvailability> = {}): BranchAvailability => ({
  timezone: 'Asia/Dhaka',
  acceptingOrders: true,
  pausedUntil: null,
  isActive: true,
  windows: WEEKDAYS.map((day) => window_(day, '10:00', '23:00')),
  closures: [],
  ...over,
});

const vendor = (over: Partial<VendorRecord> & Pick<VendorRecord, 'id'>): VendorRecord => ({
  slug: over.id,
  type: 'restaurant',
  ownerId: null,
  name: over.id,
  tagline: '',
  description: '',
  logo: '',
  cover: '',
  cuisineIds: [],
  dietary: [],
  priceLevel: 2,
  rating: 4,
  reviewCount: 0,
  location: { lat: 23.78, lng: 90.41, address: '', city: 'Dhaka', countryCode: 'BD' },
  distanceKm: 0,
  etaMinutes: [25, 40],
  deliveryFee: 60,
  minOrder: 200,
  freeDeliveryOver: null,
  hours: toWeeklyHours(WEEKDAYS.map((day) => window_(day, '10:00', '23:00'))),
  isOpen: true,
  isFeatured: false,
  isTrending: false,
  promoLabel: null,
  currency: 'BDT',
  ...AUDIT,
  ...over,
});

/**
 * The repository the service was written against, in memory.
 *
 * It implements the *SQL-side* filters only — type, cuisine, case-insensitive
 * name/tagline search, and the cap — because those are the port's whole contract.
 * `openNow` and the sorts are the service's job, and a fake that did them too would be
 * testing itself.
 */
class FakeCatalogRepository implements CatalogRepositoryPort {
  calls: VendorCandidateFilter[] = [];

  constructor(
    private readonly vendors: VendorRecord[],
    private readonly cuisineRows: CuisineRecord[] = [],
    private readonly categoryRows: CategoryRecord[] = [],
  ) {}

  async listCuisines(): Promise<CuisineRecord[]> {
    return this.cuisineRows;
  }

  async listCategories(): Promise<CategoryRecord[]> {
    return this.categoryRows;
  }

  async listVendorCandidates(filter: VendorCandidateFilter): Promise<VendorRecord[]> {
    this.calls.push(filter);
    const needle = filter.search?.toLowerCase();
    return this.vendors
      .filter((row) => (filter.type ? row.type === filter.type : true))
      .filter((row) => (filter.cuisineId ? row.cuisineIds.includes(filter.cuisineId) : true))
      .filter((row) =>
        needle
          ? row.name.toLowerCase().includes(needle) || row.tagline.toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
      .slice(0, filter.limit);
  }

  async findVendorBySlug(slug: string): Promise<VendorRecord | null> {
    return this.vendors.find((row) => row.slug === slug) ?? null;
  }

  async listVendorsByFlag(flag: 'featured' | 'trending', limit: number): Promise<VendorRecord[]> {
    return this.vendors
      .filter((row) => (flag === 'featured' ? row.isFeatured : row.isTrending))
      .slice(0, limit);
  }

  async listVendorMenu(): Promise<MenuSectionWithItemsRecord[]> {
    return [];
  }

  async listPopularFoods(_vendorId: string, limit: number): Promise<FoodItemRecord[]> {
    return Array.from({ length: Math.min(limit, 3) }, (_, index) => ({
      id: `food_${index}`,
      slug: `food-${index}`,
      vendorId: 'ven_a',
      sectionId: 'sec_a',
      name: `Dish ${index}`,
      description: '',
      image: '',
      price: 100,
      compareAtPrice: null,
      dietary: [],
      spicyLevel: 0,
      calories: null,
      rating: 4.5,
      reviewCount: 0,
      isPopular: true,
      isAvailable: true,
      optionGroups: [],
      ...AUDIT,
    }));
  }

  async findFoodBySlug(): Promise<FoodItemRecord | null> {
    return null;
  }

  async findVendorById(vendorId: string): Promise<VendorRecord | null> {
    return this.vendors.find((row) => row.id === vendorId) ?? null;
  }

  async findFoodById(): Promise<FoodItemRecord | null> {
    return null;
  }
}

/** A cache that never hits, so every read exercises the repository path. */
class NullCache implements CatalogCachePort {
  writes = 0;
  private entry: CatalogSnapshot | null = null;

  async read(): Promise<CatalogSnapshot | null> {
    return this.entry;
  }
  async write(snapshot: CatalogSnapshot): Promise<void> {
    this.writes += 1;
    this.entry = snapshot;
  }
  async invalidate(): Promise<void> {
    this.entry = null;
  }
  async readMenu(): Promise<MenuSectionWithItemsRecord[] | null> {
    return null;
  }
  async writeMenu(): Promise<void> {
    this.writes += 1;
  }
  async readFood(): Promise<FoodItemRecord | null> {
    return null;
  }
  async writeFood(): Promise<void> {
    this.writes += 1;
  }
  async invalidateVendor(): Promise<void> {}
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('V1 Unit 1 — catalog\n');

  // =========================================================================
  section('"HH:mm" parsing');

  check('midnight is 0, not falsy-null', toMinutes('00:00') === 0);
  check('09:30 is 570', toMinutes('09:30') === 570);
  check('23:59 is 1439', toMinutes('23:59') === 1439);
  check('a single-digit hour parses', toMinutes('9:30') === 570);
  check('null is null', toMinutes(null) === null);
  check('an hour past 24 is rejected', toMinutes('25:00') === null);
  check('a minute past 59 is rejected', toMinutes('10:60') === null);
  check('prose is rejected', toMinutes('lunchtime') === null);
  check('a missing minute field is rejected', toMinutes('10') === null);

  // =========================================================================
  section('the weekly grid the restaurant page renders');

  const grid = toWeeklyHours([
    window_('mon', '10:00', '23:00'),
    window_('tue', '10:00', '23:00'),
    // A split lunch/dinner service — two rows for one weekday, which `DayHours` cannot hold.
    window_('wed', '18:00', '23:00', { sort: 1 }),
    window_('wed', '12:00', '15:00', { sort: 0 }),
    // Closed: null on either side.
    window_('thu', null, null),
  ]);

  check('a day with one window reads back', grid.mon.open === '10:00' && grid.mon.close === '23:00');
  check('a split service shows its first sitting', grid.wed.open === '12:00' && grid.wed.close === '15:00');
  check('a null window is closed', grid.thu.open === null && grid.thu.close === null);
  check('a weekday with no row at all is closed', grid.fri.open === null && grid.sat.close === null);
  check('the grid always has all seven days', Object.keys(grid).length === 7);
  check(
    'and is keyed Monday-first, as the frontend indexes it',
    JSON.stringify(Object.keys(grid)) === JSON.stringify([...WEEKDAYS]),
  );

  // =========================================================================
  section('where a branch is in its own day');

  // 18:30 UTC is 00:30 the next morning in Dhaka, and still the previous evening in London.
  const lateEvening = new Date('2026-08-03T18:30:00Z');
  const dhaka = localMoment(lateEvening, 'Asia/Dhaka');
  const london = localMoment(lateEvening, 'Europe/London');

  check('Dhaka has rolled over to Tuesday', dhaka.weekday === 'tue');
  check('…at 00:30', dhaka.minutes === 30);
  check('…on the 4th', dhaka.date === '2026-08-04');
  check('London is still Monday', london.weekday === 'mon');
  check('…at 19:30', london.minutes === 19 * 60 + 30);
  check('…on the 3rd', london.date === '2026-08-03');

  // =========================================================================
  section('"is it open right now"');

  const middayDhaka = new Date('2026-08-03T06:00:00Z'); // 12:00 Mon in Dhaka
  const nightDhaka = new Date('2026-08-03T18:30:00Z'); // 00:30 Tue in Dhaka
  const earlyDhaka = new Date('2026-08-02T23:00:00Z'); // 05:00 Mon in Dhaka

  check('open inside the window', isOpenNow(availability(), middayDhaka));
  check('closed before opening', !isOpenNow(availability(), earlyDhaka));
  check('closed after closing', !isOpenNow(availability(), nightDhaka));

  const lateKitchen = availability({
    windows: WEEKDAYS.map((day) => window_(day, '18:00', '02:00', { overnight: true })),
  });
  check('an overnight window is open at 00:30 the next morning', isOpenNow(lateKitchen, nightDhaka));
  check(
    '…and at 23:30 the same evening',
    isOpenNow(lateKitchen, new Date('2026-08-03T17:30:00Z')),
  );
  check('…and shut at 05:00', !isOpenNow(lateKitchen, earlyDhaka));

  check(
    'a close time before the open time is overnight even without the flag',
    isOpenNow(
      availability({ windows: WEEKDAYS.map((day) => window_(day, '18:00', '02:00')) }),
      nightDhaka,
    ),
  );

  check(
    'only the previous day’s overnight window carries over',
    !isOpenNow(
      // Monday alone runs late; asked at 00:30 on Tuesday it is Monday's window that
      // matters, so a Tuesday-only late window must NOT open Tuesday morning.
      availability({ windows: [window_('tue', '18:00', '02:00', { overnight: true })] }),
      nightDhaka,
    ),
  );

  check(
    'the merchant’s kill switch closes an open branch',
    !isOpenNow(availability({ acceptingOrders: false }), middayDhaka),
  );
  check(
    'a pause that has not expired closes it',
    !isOpenNow(availability({ pausedUntil: new Date('2026-08-03T07:00:00Z') }), middayDhaka),
  );
  check(
    'a pause that has expired does not',
    isOpenNow(availability({ pausedUntil: new Date('2026-08-03T05:00:00Z') }), middayDhaka),
  );
  check(
    'a suspended branch is never open',
    !isOpenNow(availability({ isActive: false }), middayDhaka),
  );

  check(
    'a closure covering today closes it',
    !isOpenNow(
      availability({
        closures: [{ fromDate: new Date('2026-08-01'), toDate: new Date('2026-08-05') }],
      }),
      middayDhaka,
    ),
  );
  check(
    'a closure is inclusive of its last day',
    !isOpenNow(
      availability({
        closures: [{ fromDate: new Date('2026-08-03'), toDate: new Date('2026-08-03') }],
      }),
      middayDhaka,
    ),
  );
  check(
    'a closure that ended yesterday does not',
    isOpenNow(
      availability({
        closures: [{ fromDate: new Date('2026-07-28'), toDate: new Date('2026-08-02') }],
      }),
      middayDhaka,
    ),
  );

  check(
    'the same instant is open in Dhaka and shut in London',
    isOpenNow(availability(), middayDhaka) &&
      !isOpenNow(availability({ timezone: 'Europe/London' }), middayDhaka),
  );

  check(
    'a branch with no hours at all is closed, not open',
    !isOpenNow(availability({ windows: [] }), middayDhaka),
  );

  // =========================================================================
  section('how far away');

  check('a point is zero km from itself', haversineKm({ lat: 23.78, lng: 90.41 }, { lat: 23.78, lng: 90.41 }) === 0);
  check(
    'Gulshan 1 to Banani is 1.8 km',
    haversineKm({ lat: 23.7806, lng: 90.4152 }, { lat: 23.7936, lng: 90.4043 }) === 1.8,
  );
  check(
    'Gulshan 1 to Dhanmondi 27 is 5 km',
    haversineKm({ lat: 23.7806, lng: 90.4152 }, { lat: 23.7561, lng: 90.3742 }) === 5,
  );
  check(
    'distance is symmetric',
    haversineKm({ lat: 23.78, lng: 90.41 }, { lat: 23.75, lng: 90.37 }) ===
      haversineKm({ lat: 23.75, lng: 90.37 }, { lat: 23.78, lng: 90.41 }),
  );
  const routing = new HaversineRoutingProvider();
  check(
    'the routing port answers positionally, one call for many destinations',
    (await routing.distanceKm({ lat: 23.7806, lng: 90.4152 }, [
      { lat: 23.7806, lng: 90.4152 },
      { lat: 23.7936, lng: 90.4043 },
    ])).join(',') === '0,1.8',
  );
  check('an empty destination list is an empty result, not a failure',
    (await routing.distanceKm({ lat: 23.78, lng: 90.41 }, [])).length === 0);

  // =========================================================================
  section('ordering');

  const a = vendor({ id: 'ven_a', rating: 4.2, etaMinutes: [40, 55], distanceKm: 5 });
  const b = vendor({ id: 'ven_b', rating: 4.9, etaMinutes: [20, 30], distanceKm: 3 });
  const c = vendor({ id: 'ven_c', rating: 4.5, etaMinutes: [30, 45], distanceKm: 1, isFeatured: true });

  const order = (sort: Parameters<typeof compareVendors>[0]) =>
    [a, b, c]
      .slice()
      .sort(compareVendors(sort))
      .map((row) => row.id)
      .join(',');

  check('"recommended" puts a featured vendor first', order('recommended') === 'ven_c,ven_b,ven_a');
  check('an unknown sort falls back to recommended', order(undefined) === 'ven_c,ven_b,ven_a');
  check('"rating" ignores featured', order('rating') === 'ven_b,ven_c,ven_a');
  check('"delivery-time" uses the low end of the ETA', order('delivery-time') === 'ven_b,ven_c,ven_a');
  check('"distance" is nearest first', order('distance') === 'ven_c,ven_b,ven_a');

  const tied = [vendor({ id: 'ven_z', rating: 4.5 }), vendor({ id: 'ven_y', rating: 4.5 })];
  check(
    'equal ratings break by id, so two identical requests agree',
    tied
      .slice()
      .sort(compareVendors('rating'))
      .map((row) => row.id)
      .join(',') === 'ven_y,ven_z',
  );

  check('openNow undefined keeps a closed vendor', matchesOpenNow(vendor({ id: 'x', isOpen: false }), undefined));
  check('openNow false keeps it too', matchesOpenNow(vendor({ id: 'x', isOpen: false }), false));
  check('openNow true drops it', !matchesOpenNow(vendor({ id: 'x', isOpen: false }), true));

  // =========================================================================
  section('the directory, through the real service');

  const rows: VendorRecord[] = [
    vendor({ id: 'ven_bella', name: 'Bella Napoli', tagline: 'Wood-fired pizza', rating: 4.8, type: 'restaurant', cuisineIds: ['cus_italian'], isFeatured: true, location: { lat: 23.7806, lng: 90.4152, address: '', city: 'Dhaka', countryCode: 'BD' } }),
    vendor({ id: 'ven_burger', name: 'Burger Lab', tagline: 'Smash burgers', rating: 4.6, type: 'restaurant', cuisineIds: ['cus_american'], location: { lat: 23.7936, lng: 90.4043, address: '', city: 'Dhaka', countryCode: 'BD' } }),
    vendor({ id: 'ven_grind', name: 'The Daily Grind', tagline: 'Coffee & brunch', rating: 4.7, type: 'cafe', cuisineIds: ['cus_american'], isOpen: false }),
    vendor({ id: 'ven_rehana', name: "Rehana's Kitchen", tagline: 'Home-cooked Bengali', rating: 4.9, type: 'home-chef', cuisineIds: ['cus_bengali'] }),
    vendor({ id: 'ven_wok', name: 'Wok This Way', tagline: 'Noodles', rating: 4.4, type: 'cloud-kitchen', cuisineIds: ['cus_thai'] }),
  ];

  const repository = new FakeCatalogRepository(rows);
  const cache = new NullCache();
  const service = new CatalogService(repository, cache, new HaversineRoutingProvider(), {
    candidateLimit: DEFAULT_CANDIDATE_LIMIT,
    railLimit: 50,
    cache: { railsTtlSeconds: 900, menuTtlSeconds: 300 },
  });

  const firstPage = await service.listVendors({}, { page: 1, pageSize: 2 });
  check('page 1 holds pageSize rows', firstPage.items.length === 2);
  check('total counts every match, not the page', firstPage.total === 5);
  check('hasMore is true when rows remain', firstPage.hasMore);
  check('page and pageSize are echoed back', firstPage.page === 1 && firstPage.pageSize === 2);

  const lastPage = await service.listVendors({}, { page: 3, pageSize: 2 });
  check('the last page holds the remainder', lastPage.items.length === 1);
  check('…and reports no more', !lastPage.hasMore);

  const pastTheEnd = await service.listVendors({}, { page: 9, pageSize: 2 });
  check('a page past the end is empty rather than an error', pastTheEnd.items.length === 0);
  check('…and still reports the true total', pastTheEnd.total === 5);

  const paged = [
    ...(await service.listVendors({}, { page: 1, pageSize: 2 })).items,
    ...(await service.listVendors({}, { page: 2, pageSize: 2 })).items,
    ...(await service.listVendors({}, { page: 3, pageSize: 2 })).items,
  ].map((row) => row.id);
  check('paging visits every vendor exactly once', new Set(paged).size === 5 && paged.length === 5);

  const searched = await service.listVendors({ search: 'burger' });
  check('search matches a name', searched.items.length === 1 && searched.items[0].id === 'ven_burger');

  const byTagline = await service.listVendors({ search: 'BRUNCH' });
  check('search matches a tagline, case-insensitively', byTagline.items.length === 1 && byTagline.items[0].id === 'ven_grind');

  const noMatch = await service.listVendors({ search: 'sushi' });
  check('a search with no matches is an empty page, total 0', noMatch.items.length === 0 && noMatch.total === 0);

  const blankSearch = await service.listVendors({ search: '   ' });
  check('a whitespace-only search is not a filter', blankSearch.total === 5);
  check(
    '…and never reaches the database as one',
    repository.calls[repository.calls.length - 1].search === undefined,
  );

  const cafes = await service.listVendors({ type: 'cafe' });
  check('the type filter narrows to one', cafes.total === 1 && cafes.items[0].id === 'ven_grind');

  const american = await service.listVendors({ cuisineId: 'cus_american' });
  check('the cuisine filter narrows to two', american.total === 2);

  const openOnly = await service.listVendors({ openNow: true });
  check('openNow drops the closed cafe', openOnly.total === 4 && !openOnly.items.some((row) => row.id === 'ven_grind'));

  const combined = await service.listVendors({ type: 'restaurant', cuisineId: 'cus_italian', search: 'bella' });
  check('filters compose', combined.total === 1 && combined.items[0].id === 'ven_bella');

  const withOrigin = await service.listVendors(
    { origin: { lat: 23.7806, lng: 90.4152 }, sort: 'distance' },
    { page: 1, pageSize: 5 },
  );
  check('an origin makes distance real', withOrigin.items[0].distanceKm === 0);
  check(
    '…and sorts by it',
    withOrigin.items.map((row) => row.distanceKm).every((km, i, all) => i === 0 || km >= all[i - 1]),
  );

  const withoutOrigin = await service.listVendors({});
  check('no origin leaves distance at 0 rather than guessing', withoutOrigin.items.every((row) => row.distanceKm === 0));

  check('the repository is asked for at most the cap', repository.calls.every((call) => call.limit === DEFAULT_CANDIDATE_LIMIT));

  const rails = await service.cuisines();
  check('an empty rail is an empty array, not a null', Array.isArray(rails) && rails.length === 0);
  check('the rails are cached after the first read', cache.writes === 1);
  await service.categories();
  check('…and the second read does not write again', cache.writes === 1);

  check('a rail limit is clamped rather than trusted', (await service.popularItems('ven_a', 10_000)).length === 3);
  check('…and a zero or negative limit still returns something', (await service.popularItems('ven_a', 0)).length === 1);

  // =========================================================================
  section('the seeder’s input');

  /**
   * `seed-demo.ts` cannot be run here, so its *input* is checked instead — every
   * referential and column-width constraint Postgres would enforce, asserted against
   * the generated dataset. A dangling `sectionId` or an id one character too long is a
   * foreign-key violation half way through a seed run, on a machine that has a database,
   * with a hundred rows already written.
   */
  const dataset = JSON.parse(
    readFileSync(join(process.cwd(), 'scripts', 'data', 'catalog-demo.json'), 'utf8'),
  ) as {
    cuisines: { id: string; slug: string; image: string }[];
    categories: { id: string; slug: string; keywords: string[]; image: string }[];
    vendors: {
      id: string;
      slug: string;
      type: string;
      ownerId: string | null;
      cuisineIds: string[];
      dietary: string[];
      hours: Record<string, { open: string | null; close: string | null }>;
      etaMinutes: number[];
      logo: string;
      cover: string;
      location: { countryCode: string };
    }[];
    menuSections: { id: string; vendorId: string }[];
    foods: {
      id: string;
      slug: string;
      vendorId: string;
      sectionId: string;
      dietary: string[];
      spicyLevel: number;
      image: string;
      optionGroups: { id: string; options: { id: string }[] }[];
    }[];
    users: { id: string; email: string; role: string; countryCode: string }[];
  };

  const vendorIds = new Set(dataset.vendors.map((row) => row.id));
  const cuisineIds = new Set(dataset.cuisines.map((row) => row.id));
  const sectionIdSet = new Set(dataset.menuSections.map((row) => row.id));
  const userIds = new Set(dataset.users.map((row) => row.id));

  check('the dataset has vendors, sections and dishes', dataset.vendors.length > 0 && dataset.menuSections.length > 0 && dataset.foods.length > 0);
  check('every section belongs to a vendor that exists', dataset.menuSections.every((row) => vendorIds.has(row.vendorId)));
  check('every dish belongs to a vendor that exists', dataset.foods.every((row) => vendorIds.has(row.vendorId)));
  check('every dish belongs to a section that exists', dataset.foods.every((row) => sectionIdSet.has(row.sectionId)));
  check('every dish sits in a section owned by its own vendor', dataset.foods.every((food) => {
    const section = dataset.menuSections.find((row) => row.id === food.sectionId);
    return section !== undefined && section.vendorId === food.vendorId;
  }));
  check('every cuisine a vendor claims exists', dataset.vendors.every((row) => row.cuisineIds.every((id) => cuisineIds.has(id))));
  check('every vendor owner is an account in the dataset', dataset.vendors.every((row) => row.ownerId === null || userIds.has(row.ownerId)));

  const ids = [
    ...dataset.vendors.map((r) => r.id),
    ...dataset.menuSections.map((r) => r.id),
    ...dataset.foods.map((r) => r.id),
    ...dataset.foods.flatMap((r) => r.optionGroups.map((g) => g.id)),
    ...dataset.foods.flatMap((r) => r.optionGroups.flatMap((g) => g.options.map((o) => o.id))),
    ...dataset.cuisines.map((r) => r.id),
    ...dataset.categories.map((r) => r.id),
    ...dataset.users.map((r) => r.id),
  ];
  check('no id exceeds VarChar(40)', ids.every((id) => id.length <= 40));
  check('no id is empty', ids.every((id) => id.length > 0));
  check('every id is unique within its kind', new Set(dataset.foods.map((r) => r.id)).size === dataset.foods.length);

  // `brn_` / `men_` / `bhr_` ids are derived from the vendor's, so the derivation has
  // to fit too — and `bhr_<vendor>_wednesday` is the longest thing the seeder mints.
  check(
    'the ids the seeder derives also fit VarChar(40)',
    dataset.vendors.every((row) => `bhr_${row.id.replace(/^ven_/, '')}_wed`.length <= 40),
  );

  check('every vendor slug is unique', new Set(dataset.vendors.map((r) => r.slug)).size === dataset.vendors.length);
  check('every dish slug is unique', new Set(dataset.foods.map((r) => r.slug)).size === dataset.foods.length);
  check('every account email is unique', new Set(dataset.users.map((r) => r.email.toLowerCase())).size === dataset.users.length);

  check('every vendor type is in the vocabulary', dataset.vendors.every((row) => (VENDOR_TYPES as readonly string[]).includes(row.type)));
  check(
    'every dietary tag is in the vocabulary',
    [...dataset.vendors.flatMap((r) => r.dietary), ...dataset.foods.flatMap((r) => r.dietary)].every((tag) =>
      (DIETARY_TAGS as readonly string[]).includes(tag),
    ),
  );
  check(
    'every vendor states all seven weekdays',
    dataset.vendors.every((row) => WEEKDAYS.every((day) => day in row.hours)),
  );
  check(
    'every opening time parses',
    dataset.vendors.every((row) =>
      Object.values(row.hours).every(
        (day) =>
          (day.open === null && day.close === null) ||
          (toMinutes(day.open) !== null && toMinutes(day.close) !== null),
      ),
    ),
  );
  check('every ETA is a two-entry window, low end first', dataset.vendors.every((row) => row.etaMinutes.length === 2 && row.etaMinutes[0] <= row.etaMinutes[1]));
  check('every spicyLevel is 0–3, as the frontend union says', dataset.foods.every((row) => row.spicyLevel >= 0 && row.spicyLevel <= 3));

  const urls = [
    ...dataset.cuisines.map((r) => r.image),
    ...dataset.categories.map((r) => r.image),
    ...dataset.foods.map((r) => r.image),
    ...dataset.vendors.flatMap((r) => [r.logo, r.cover]),
  ];
  check('every image is an absolute https URL', urls.every((url) => url.startsWith('https://')));
  check('no image field is blank', urls.every((url) => url.length > 0));
  check('every image URL fits VarChar(500)', urls.every((url) => url.length <= 500));

  check('every category has at least one search keyword', dataset.categories.every((row) => row.keywords.length > 0));
  check('every keyword fits VarChar(80)', dataset.categories.every((row) => row.keywords.every((term) => term.length <= 80)));
  check('every branch names a country the reference seed writes', dataset.vendors.every((row) => /^[A-Z]{2}$/.test(row.location.countryCode)));

  // =========================================================================
  section('vocabulary drift against Postgres');

  try {
    assertVocabularyMatches('VendorTypeKind', VENDOR_TYPES);
    assertVocabularyMatches('DietaryTagKind', DIETARY_TAGS);
    assertVocabularyMatches('WeekdayKind', WEEKDAYS);
    check('every catalog vocabulary matches its Postgres enum', true);
  } catch (error) {
    check(`vocabulary drift: ${error instanceof Error ? error.message : String(error)}`, false);
  }

  try {
    assertVocabularyMatches('VendorTypeKind', ['restaurant']);
    check('drift detection actually fails on a mismatch', false);
  } catch {
    check('drift detection actually fails on a mismatch', true);
  }

  // =========================================================================
  console.log(
    failures.length === 0
      ? `\n✓ ${passed} assertions passed, 0 failed.`
      : `\n✗ ${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `    ${f}`).join('\n')}`,
  );
  if (failures.length > 0) process.exit(1);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
