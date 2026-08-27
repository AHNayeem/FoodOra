#!/usr/bin/env node
/**
 * seed-catalog.js — `npm run seed:catalog`.
 *
 * The same shell as `seed-reference.js`, for the same reason: `DATABASE_URL` is
 * read straight from the environment rather than through `config/env.js`, which
 * validates JWT and CORS settings a seeder has no use for.
 *
 * Run it **after** `seed:reference`. Nothing here points at a country or a
 * currency, so the order is not a foreign key — but a database with a taxonomy
 * and no countries cannot hold an account, and a catalog with no accounts cannot
 * be browsed as anyone.
 */
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedCatalogTaxonomy } from "../src/seed/catalog.js";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

loadEnv({ path: resolve(backendRoot, ".env"), override: false });

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "  Run it from backend/ with a .env file (cp .env.example .env),\n" +
      "  or from database/ where Prisma loads database/.env for you.",
  );
  process.exit(1);
}

try {
  await seedCatalogTaxonomy({ databaseUrl: process.env.DATABASE_URL });
} catch (error) {
  console.error("seeding failed:", error.message);
  if (process.env.NODE_ENV !== "production") console.error(error);
  process.exit(1);
}
