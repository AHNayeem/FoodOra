/**
 * Freeze the Phase C mock catalog into JSON the backend seeder can read.
 *
 *     bun run export:catalog
 *
 * Writes `backend/scripts/data/catalog-demo.json`.
 *
 * ## Why a generated file rather than a hand-written seeder
 *
 * `seed-reference.ts` copies its five countries and three locales into the backend by
 * hand, and says why: the two packages do not share a build, and the database is meant
 * to become the source of truth. That argument holds for a dozen rows. It does not hold
 * for this: twenty vendors, fifty sections, sixty dishes and their variants is roughly
 * a thousand values, and a thousand hand-copied values is a thousand chances for the
 * seeded catalog to differ from the mock in one price, one slug or one `isPopular`
 * flag — which would show up as a UI that changes when the flag is flipped, the exact
 * failure V1 exists to avoid.
 *
 * So the transcription is mechanical and re-runnable, and the output is committed so
 * the backend has no build-time dependency on the frontend. Re-run it after editing
 * `lib/mock/*`; the diff on the JSON is the review.
 *
 * The **shape** stays raw on purpose. Everything structural — splitting a flat
 * `Vendor` into a brand and a branch, folding `WeeklyHours` into rows, deriving a
 * timezone — happens in the seeder, next to the schema it has to satisfy, where it can
 * be read against `catalog.prisma`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { categories } from '../lib/mock/categories';
import { cuisines, SEED_NOW } from '../lib/mock/cuisines';
import { foods } from '../lib/mock/foods';
import { menuSections } from '../lib/mock/menus';
import { users } from '../lib/mock/users';
import { vendors } from '../lib/mock/vendors';

/** Run from `frontend/`, so the sibling package is one level up. */
const OUT = join(process.cwd(), '..', 'backend', 'scripts', 'data', 'catalog-demo.json');

const payload = {
  /**
   * Read by the seeder purely to print it, so whoever is looking at a seeded database
   * can tell which mock revision produced it without diffing a thousand rows.
   */
  generatedFrom: 'frontend/lib/mock — regenerate with `bun run export:catalog`',
  seedNow: SEED_NOW,
  cuisines,
  categories,
  vendors,
  menuSections,
  foods,
  /**
   * The demo accounts, and the one thing here that is not catalog data.
   *
   * `Vendor.ownerId` points at `usr_owner`, and the vendor dashboard loads "my
   * restaurant" through it — so a catalog seeded without these accounts has a
   * dangling owner on the one storefront anybody demonstrates. Passwords are not
   * exported: the mock's is a plaintext constant on the sign-in screen, and the
   * seeder hashes its own.
   */
  users,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(
  [
    `✓ ${OUT}`,
    `  ${payload.cuisines.length} cuisines · ${payload.categories.length} categories`,
    `  ${payload.vendors.length} vendors · ${payload.menuSections.length} sections · ${payload.foods.length} dishes`,
    `  ${payload.foods.reduce((n, food) => n + food.optionGroups.length, 0)} option groups · ` +
      `${payload.foods.reduce((n, food) => n + food.optionGroups.reduce((m, g) => m + g.options.length, 0), 0)} options`,
    `  ${payload.users.length} demo accounts`,
  ].join('\n'),
);
