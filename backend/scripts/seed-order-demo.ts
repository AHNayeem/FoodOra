/**
 * The demo *order* seeder — declared now, empty until the orders module exists.
 *
 *     bun run seed:order-demo
 *
 * The three seeders are split along "can you delete it", and this is the third:
 *
 *   seed:reference   load-bearing. `User.countryCode` is a non-null FK onto `countries`,
 *                    so an empty reference set means no account can be created at all.
 *                    A production install runs this one and neither of the others.
 *   seed:demo        the demo accounts and the whole catalog — showcase data.
 *   seed:order-demo  carts, orders, deliveries and their events.            ← this file
 *
 * ## Why it is separate rather than part of `seed:demo`
 *
 * It is the only one that is genuinely dangerous to re-run. A catalog row is a
 * description of a thing that exists, so upserting it twice is harmless. An order is a
 * *financial document* with a ledger entry, a payment intent and an append-only event
 * log behind it — so a seeder that upserts one is a seeder that can rewrite history,
 * and `stock_movements` and `order_events` are append-only precisely to make that
 * impossible. Whatever this grows into has to reconcile rather than upsert, and mixing
 * that with a catalog upsert would make the safe seeder inherit the unsafe one's
 * caveats.
 *
 * It also has a different audience: a client demo needs orders mid-flight — one in the
 * kitchen, one with a rider, one delivered — which is a *scenario*, refreshed between
 * runs, not a fixture.
 *
 * ## Deliberately not implemented
 *
 * V1 Unit 1 is the catalog read side. Orders, carts, payments and delivery are
 * explicitly out of its scope, and a seeder that wrote them would be writing rows no
 * module can yet read or update — which is worse than an empty file, because a
 * half-seeded order looks like a bug in the orders module when it arrives.
 *
 * It exits 0. There is nothing to do yet, and a bring-up script that runs all three
 * seeders should not fail on the one that is waiting for its unit.
 */
console.log(
  [
    'seed:order-demo — nothing to write yet.',
    '',
    'Carts, orders, payments and deliveries land with the units that own them',
    '(V1 Units 4–6). This script is the placeholder the bring-up sequence calls,',
    'so the third seeder exists before the data it will write does.',
    '',
    'For now:  bun run seed:reference && bun run seed:demo',
  ].join('\n'),
);
