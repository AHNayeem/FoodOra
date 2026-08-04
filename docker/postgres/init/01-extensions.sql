-- Extensions the schema declares (`main.prisma` datasource block) plus the one
-- reservations will need for exclusion constraints.
--
-- Runs once, on an empty data directory. In staging and production these are
-- created by the first migration instead, because a managed Postgres has no
-- docker-entrypoint-initdb.d.

-- Trigram similarity: "biryani" finds "biriyani" (D5 §Search).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Accent folding, so "café" and "cafe" are the same search.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Case-insensitive text — email and slug uniqueness that cannot be defeated
-- by capitalisation.
CREATE EXTENSION IF NOT EXISTS citext;

-- GIN over scalar columns, for the mixed full-text + filter indexes.
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Range exclusion constraints: two bookings cannot hold the same table over
-- overlapping times, enforced by the database rather than by hope.
CREATE EXTENSION IF NOT EXISTS btree_gist;
