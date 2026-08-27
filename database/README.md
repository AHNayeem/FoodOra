# @foodora/database

The Prisma schema, its migrations, and the commands that apply them. **18 files,
184 models, 127 enums.**

The design and the verification record live in
[`docs/FOODORA-DATABASE-DESIGN.md`](../docs/FOODORA-DATABASE-DESIGN.md); what
the next backend must do with it is
[`docs/FOODORA-BACKEND-REQUIREMENTS.md`](../docs/FOODORA-BACKEND-REQUIREMENTS.md).

## Bringing a database up from nothing

```bash
# 1. Any PostgreSQL 12+ reachable at DATABASE_URL. The extensions the schema
#    declares — pg_trgm, unaccent, citext, btree_gin — must be available;
#    they ship with a standard contrib build.

# 2. Schema
cd database && bun run migrate:deploy

# 3. Reference data — currencies, countries, languages, roles, permissions.
#    Nothing else works before this: `User.countryCode` is a non-null FK to
#    `countries`, so no account can be created until a country row exists.
bun run seed   # ⚠️ see below — the seeder does not currently exist
```

> **`bun run seed` is broken and is the one blocking prerequisite for a runnable
> stack.** `package.json#prisma.seed` delegates to `backend`'s `seed:reference`,
> and that backend has been removed. The seeder needs an id service and the
> permission catalogue, so it belongs with the new backend. The minimum
> reference set is specified in
> [BACKEND-REQUIREMENTS §2](../docs/FOODORA-BACKEND-REQUIREMENTS.md#2-the-one-blocking-prerequisite),
> and a working example of it is the end-to-end fixture described in
> [DATABASE-DESIGN §9](../docs/FOODORA-DATABASE-DESIGN.md#9-verification).

There is no `docker-compose` any more — `docker/` was deleted. Point
`DATABASE_URL` at whatever PostgreSQL you have.

## Migrations

| Migration | What it is |
| --- | --- |
| `20260803120000_v1_baseline` | The V1 datamodel. Generated. |
| `20260803120100_v1_partial_unique_indexes` | Five partial unique indexes Prisma cannot express. |
| `20260827120000_v2_gap_closure` | The gap-closure phase: 15 new models, 8 extended, DSC-1 and DSC-2 closed. Generated, then hand-corrected in three places. |
| `20260827120100_v2_partial_constraints` | Five CHECK constraints and seven more partial unique indexes. |

They live in `prisma/schema/migrations/`, beside the schema folder, which is
where Prisma resolves them from when `schema` points at a directory.

### `migrate deploy`, not `migrate dev`

Prisma cannot see partial indexes or CHECK constraints, so `migrate dev` finds
the 12 partial indexes and 5 CHECKs, calls them drift, and offers to reset the
database. Use `migrate:deploy` to apply and `migrate:status` to check.

To author the next migration:

```bash
# Offline — needs no database.
bun run migrate:baseline > /tmp/full.sql

# Or diff the deployed state against the schema:
bunx prisma migrate diff \
  --from-url "$DATABASE_DIRECT_URL" \
  --to-schema-datamodel ./prisma/schema \
  --script > prisma/schema/migrations/<timestamp>_<name>/migration.sql
bun run migrate:deploy
```

**Then read what it produced.** The v2 migration needed three hand corrections
the generator cannot make:

- **Enum members were appended rather than positioned.** `ADD VALUE 'scheduled'`
  puts the state an order is *born* in after every terminal state. Ordinal order
  carries meaning; use `… BEFORE 'placed'`.
- **A primary-key change came with no backfill.** Prisma swaps constraints and
  never touches rows.
- **A `NOT NULL` column was added with no default**, which fails on any table
  that already has rows. Add nullable, backfill, then constrain.

## Verified

This schema **has run**. The previous version of this file said "No PostgreSQL
has ever run this schema … the first `migrate deploy` is the test." That test
has been taken:

| Check | Result |
| --- | --- |
| `prisma validate` | passes |
| `migrate deploy` from empty | all 4 applied |
| `migrate diff` vs the applied database | empty — no drift |
| Migration path with existing data | verified, including the DSC-1 collision |
| `prisma generate` + read back through the client | 28 / 28 |
| Constraint negative tests | 22 / 22 (18 refused, 4 allowed) |
| End-to-end lifecycle assertions | 26 / 26 |

Details in [DATABASE-DESIGN §9](../docs/FOODORA-DATABASE-DESIGN.md#9-verification).

## Generated client

`bun run generate` writes to `generated/client` (gitignored) and consumers
import it through `@foodora/database`. It used to write into
`backend/src/infrastructure/prisma/generated`, a path in the removed NestJS
tree; generating into a folder the next backend has not created — and whose
shape was NestJS's, not Fastify's — was not worth preserving.

## Known deprecation

`package.json#prisma` is deprecated and goes away in Prisma 7; the replacement
is `prisma.config.ts`. Deferred deliberately: a config file stops Prisma
auto-loading `.env`, so the move needs explicit env loading and a re-test of
every command. Worth doing with the Prisma 7 upgrade, not before it.
