#!/usr/bin/env node
/**
 * seed-reference.js — the entry point `prisma db seed` calls.
 *
 * Kept to a shell around `src/seed/reference.js` for one reason: it is invoked
 * from two working directories. `npm run seed:reference` runs it from `backend/`
 * with the backend's own `.env`; `cd database && bun run seed` runs it from
 * `database/` with the environment Prisma has already loaded from
 * `database/.env`. Reading `DATABASE_URL` straight from `process.env` — rather
 * than through `config/env.js`, which validates JWT and CORS settings the seeder
 * has no use for — is what makes both work.
 */
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedReferenceData } from "../src/seed/reference.js";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Never overrides what is already set, so Prisma's own `.env` load wins when it
// ran first and the backend's is the fallback when nothing did.
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
  await seedReferenceData({ databaseUrl: process.env.DATABASE_URL });
} catch (error) {
  console.error("seeding failed:", error.message);
  if (process.env.NODE_ENV !== "production") console.error(error);
  process.exit(1);
}
