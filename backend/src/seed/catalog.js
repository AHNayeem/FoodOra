/**
 * catalog.js — the module 4 taxonomy seeder.
 *
 * `cuisines`, `categories` and `category_keywords`: the vocabulary discovery
 * filters on. Without it `GET /catalog/cuisines` answers an empty list and a
 * category tile resolves to nothing, so the module is not exercisable at all —
 * which is why this ships with module 4 rather than being left to a demo seeder.
 *
 * It keeps the three properties `seed/reference.js` is written for, for the same
 * reasons that file gives at length:
 *
 *  - **deterministic** — `deterministicId(prefix, slug)`, so `pizza` is the same
 *    `cat_…` id in every database that has run this, and a `VendorCuisine` row
 *    exported from staging means something in production;
 *  - **idempotent** — every write is an upsert on the row's natural key (`slug`,
 *    and `{ categoryId, term }` for a keyword). The second run changes nothing;
 *  - **safe on a live database** — the `update` half refreshes the *definition*
 *    (a name, an emoji, a sort order) and never touches `deletedAt`. A category
 *    an operator retired stays retired.
 *
 * One thing it does that the reference seeder does not: **keywords are
 * reconciled, not merely upserted.** A term dropped from `data/catalog.js` has to
 * leave the database, or a tile keeps matching on a word nobody can see in the
 * source any more. `category_keywords` has no `deletedAt` — it is a pure join
 * table — so the delete is a real one and needs no `$unfiltered`.
 *
 *     npm run seed:catalog
 */
import { PrismaClient } from "@foodora/database";
import { deterministicId } from "../shared/utils/ids.js";
import { ID_PREFIXES } from "../shared/constants/id-prefixes.js";
import { categories, cuisines } from "./data/catalog.js";

/** Lower-cased, as `CategoryKeyword.term`'s own comment requires. */
const normaliseTerm = (term) => term.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Tallies what happened, so the summary is counted rather than claimed. */
function counter() {
  const counts = {};
  return {
    add(table, n = 1) {
      counts[table] = (counts[table] ?? 0) + n;
    },
    get counts() {
      return counts;
    },
  };
}

/**
 * @param {import("@foodora/database").PrismaClient} tx
 * @param {{ info: (message: string) => void }} log
 */
async function seedInto(tx, log) {
  const tally = counter();

  // -- Cuisines -------------------------------------------------------------
  for (const cuisine of cuisines) {
    const { slug, ...rest } = cuisine;
    const id = deterministicId(ID_PREFIXES.cuisine, slug);
    await tx.cuisine.upsert({ where: { slug }, create: { id, slug, ...rest }, update: rest });
    tally.add("cuisines");
  }

  // -- Categories, and the keywords that make a tile a real query -----------
  for (const category of categories) {
    const { slug, keywords, ...rest } = category;
    const id = deterministicId(ID_PREFIXES.category, slug);

    // `parentId` is left alone: the column exists for a future two-level browse
    // tree and there is no second level in the product yet.
    const row = await tx.category.upsert({
      where: { slug },
      create: { id, slug, ...rest },
      update: rest,
      select: { id: true },
    });
    tally.add("categories");

    const wanted = [...new Set(keywords.map(normaliseTerm))].filter(Boolean);
    for (const term of wanted) {
      await tx.categoryKeyword.upsert({
        where: { categoryId_term: { categoryId: row.id, term } },
        create: { categoryId: row.id, term },
        // Nothing to refresh — `weight` is the column's default and the pair is
        // the primary key. The upsert is what makes a re-run a no-op.
        update: {},
      });
      tally.add("category_keywords");
    }

    // See the header: a term that left the source has to leave the database.
    const stale = await tx.categoryKeyword.deleteMany({
      where: { categoryId: row.id, term: { notIn: wanted } },
    });
    if (stale.count > 0) {
      log.info(`  removed ${stale.count} stale keyword(s) from "${slug}"`);
      tally.add("category_keywords_removed", stale.count);
    }
  }

  for (const [table, count] of Object.entries(tally.counts)) log.info(`  ${String(count).padStart(4)}  ${table}`);
  return tally.counts;
}

/**
 * Seed the taxonomy, in one transaction.
 *
 * All of it or none of it, for the reason the reference seeder gives: a run that
 * failed halfway would leave categories whose keywords are half the list, and a
 * tile that matches on half its terms is worse than one that does not exist.
 *
 * @param {{ databaseUrl?: string, logger?: { info: (message: string) => void }, prisma?: object }} [options]
 *   `prisma` runs it on a client somebody else owns — what the test suite does,
 *   so that seeding is exercised on the same connection as the assertions.
 */
export async function seedCatalogTaxonomy(options = {}) {
  const log = options.logger ?? console;
  const borrowed = Boolean(options.prisma);
  const prisma =
    options.prisma ??
    new PrismaClient(options.databaseUrl ? { datasources: { db: { url: options.databaseUrl } } } : undefined);

  const started = Date.now();
  try {
    log.info("seeding catalog taxonomy…");
    const counts = await prisma.$transaction((tx) => seedInto(tx, log), { timeout: 60_000, maxWait: 10_000 });
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    log.info(
      `catalog taxonomy seeded: ${total} rows across ${Object.keys(counts).length} tables in ${Date.now() - started}ms`,
    );
    return counts;
  } finally {
    if (!borrowed) await prisma.$disconnect();
  }
}

export default seedCatalogTaxonomy;
