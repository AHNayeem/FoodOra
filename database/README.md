# @foodora/database

The Prisma schema (Phase D4), its migrations, and the commands that apply them.

## Bringing a database up from nothing

```bash
# 1. Postgres, Redis, MinIO and Mailpit
docker compose -f docker/docker-compose.dev.yml up -d postgres redis

# 2. Schema
cd database && bun run migrate:deploy

# 3. Reference data — currencies, countries, languages, roles, permissions.
#    Nothing else will work before this: `User.countryCode` is a non-null FK to
#    `countries`, so no account can be created until a country row exists.
bun run seed
```

`bun run seed` delegates to `backend`'s `seed:reference`, which needs the Nest
container (`IdService`, the permission catalogue) and therefore lives there. The
demo seeder — restaurants, menus, orders in every status — arrives with V1 Unit 9
and will sit alongside it.

## Migrations

| Migration                            | What it is                                                        |
| ------------------------------------ | ----------------------------------------------------------------- |
| `20260803120000_v1_baseline`         | The whole datamodel. Generated; regenerate with `migrate:baseline`. |
| `20260803120100_v1_partial_unique_indexes` | Five hand-written partial unique indexes Prisma cannot express. |

### `migrate deploy`, not `migrate dev`

Prisma's drift detection cannot see partial indexes, so `migrate dev` finds the
five indexes in the second migration, calls them drift, and offers to reset the
database. Use `migrate:deploy` to apply and `migrate:status` to check.

To author the next migration:

```bash
# Offline — needs no database, which is how the baseline was produced.
bun run migrate:baseline > /tmp/full.sql

# Or, against a live database, diff the deployed state against the schema:
bunx prisma migrate diff \
  --from-url "$DATABASE_DIRECT_URL" \
  --to-schema-datamodel ./prisma/schema \
  --script > prisma/migrations/<timestamp>_<name>/migration.sql
bun run migrate:deploy
```

### Not yet verified

No PostgreSQL has ever run this schema. `prisma validate` passes, the baseline is
engine-generated, and every identifier in the hand-written migration was checked
against the baseline DDL — but "the migration applies cleanly" is still a claim,
not a fact. The first `migrate:deploy` is the test.

## Known deprecation

`package.json#prisma` is deprecated and goes away in Prisma 7; the replacement is
`prisma.config.ts`. Deferred deliberately: a config file stops Prisma
auto-loading `.env`, so the move needs explicit env loading and a re-test of every
command. Worth doing with the Prisma 7 upgrade, not before it.
