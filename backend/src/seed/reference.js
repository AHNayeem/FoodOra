/**
 * reference.js — the reference-data seeder.
 *
 * BACKEND-REQUIREMENTS §2 calls this "the one blocking prerequisite", and the
 * reason is one foreign key: `User.countryCode` is `NOT NULL` and points at
 * `countries`, so **no account can be created until a country row exists**. Every
 * module in §3 is downstream of an account. Nothing works before this runs.
 *
 * It replaces `database/package.json#prisma.seed`'s old target, which was
 * `backend`'s `seed:reference` in the removed NestJS tree — the reason
 * `bun run seed` has been failing since that tree was deleted.
 *
 * ## The three properties it is written for
 *
 *  - **Deterministic.** Ids come from `deterministicId`, a hash of the row's
 *    natural key, not from a random ULID. `orders.view` is the same permission
 *    id in every database that has ever run this, so a `RolePermission` grant
 *    means the same thing in staging as in production.
 *  - **Idempotent.** Every write is an upsert on a key the row already has. Run
 *    it twice, or a hundred times, and the second run changes nothing.
 *  - **Safe on a live database.** The `update` half of each upsert refreshes the
 *    *definition* — a label, a rate, a grant — and never touches `deletedAt`. An
 *    operator who deactivated a zone finds it still deactivated afterwards; a
 *    seeder that resurrects rows somebody deliberately retired is a seeder
 *    nobody dares run against production.
 *
 * ## What it does not do
 *
 * No restaurants, no menus, no orders, no accounts. §2 is explicit that a demo
 * seeder — the financial scenarios, orders in every status — is separate and
 * comes after. Mixing them would make the one seeder a production deployment
 * needs the same one that fills the database with invented trade.
 *
 * ## Running it
 *
 *     cd backend   && npm run seed:reference
 *     cd database  && bun run seed          # via prisma db seed → this file
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@foodora/database";
import { toDbInput } from "../shared/utils/enums.js";
import { deterministicId } from "../shared/utils/ids.js";
import { ID_PREFIXES } from "../shared/constants/id-prefixes.js";
import {
  countries,
  countryLanguages,
  currencies,
  deliveryZones,
  languages,
  paymentProviders,
  permissions,
  platformLedgerAccountKinds,
  roles,
  taxRules,
} from "./data/reference.js";
import { notificationTemplates } from "./data/notification-templates.js";

/**
 * Read rather than `import … with { type: "json" }`: JSON module imports are
 * still flagged experimental on Node 20 and print a warning on every seed run.
 */
const cmsCollections = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "data/cms-collections.json"), "utf8"),
);

/**
 * The currency the platform's own books are kept in.
 *
 * One set of platform ledger accounts, not one per country: a ledger account is
 * where money *is*, and the platform holds one balance. Trading in a second
 * currency means a second set, and the module that introduces it makes that
 * decision with a real second market in front of it.
 */
const LEDGER_CURRENCY = "BDT";

/** Tax rules apply from the beginning of time — there is no earlier régime to model. */
const EPOCH = new Date("1970-01-01T00:00:00.000Z");

/**
 * `"Bashundhara R/A"` → `"bashundhara r/a"`.
 *
 * `ZoneArea.area` is documented as "lower-cased, unaccented at write time" and
 * is the column an area lookup matches on; `label` keeps the form a customer
 * would recognise. Decomposing to NFD and dropping the combining marks is what
 * "unaccented" means for a label that might arrive as "Bāridhārā".
 */
function normalizeArea(label) {
  return label.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

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

  // -- Currencies -----------------------------------------------------------
  for (const currency of currencies) {
    const { code, ...rest } = currency;
    await tx.currency.upsert({ where: { code }, create: { code, ...rest }, update: rest });
    tally.add("currencies");
  }

  // -- Languages ------------------------------------------------------------
  for (const language of languages) {
    const { code, ...rest } = toDbInput("Language", language);
    await tx.language.upsert({ where: { code }, create: { code, ...rest }, update: rest });
    tally.add("languages");
  }

  // -- Countries ------------------------------------------------------------
  // After currencies: `Country.currencyCode` is a restrict-on-delete FK.
  for (const country of countries) {
    const { code, ...rest } = country;
    await tx.country.upsert({ where: { code }, create: { code, ...rest }, update: rest });
    tally.add("countries");
  }

  for (const link of countryLanguages) {
    const { countryCode, languageCode, ...rest } = link;
    await tx.countryLanguage.upsert({
      where: { countryCode_languageCode: { countryCode, languageCode } },
      create: { countryCode, languageCode, ...rest },
      update: rest,
    });
    tally.add("country_languages");
  }

  // -- Tax ------------------------------------------------------------------
  for (const rule of taxRules) {
    const id = deterministicId(ID_PREFIXES.taxRule, `${rule.countryCode}:order-subtotal`);
    const data = toDbInput("TaxRule", {
      ...rule,
      appliesTo: "order-subtotal",
      isInclusive: false,
      effectiveFrom: EPOCH,
      priority: 0,
    });
    await tx.taxRule.upsert({ where: { id }, create: { id, ...data }, update: data });
    tally.add("tax_rules");
  }

  // -- Permissions ----------------------------------------------------------
  const permissionIdBySlug = new Map();
  for (const permission of permissions) {
    const id = deterministicId(ID_PREFIXES.permission, permission.slug);
    permissionIdBySlug.set(permission.slug, id);
    await tx.permission.upsert({ where: { id }, create: { id, ...permission }, update: permission });
    tally.add("permissions");
  }

  // -- Roles and their grants ----------------------------------------------
  for (const role of roles) {
    const { grants, ...definition } = role;
    const id = deterministicId(ID_PREFIXES.role, role.slug);
    const data = toDbInput("Role", { ...definition, description: definition.description ?? "", isSystem: true });

    await tx.role.upsert({ where: { id }, create: { id, ...data }, update: data });
    tally.add("roles");

    /**
     * The grant list is replaced, not merged.
     *
     * `ROLE_PERMISSIONS` is the whole answer for a built-in role — the frontend
     * reads it that way in `lib/rbac.ts::permissionsFor`, and an account's own
     * `permissions` is what adds to it. So removing a permission from the table
     * has to remove the grant here too; an additive seeder would mean a right
     * could be given but never taken back.
     */
    const wanted = grants.map((slug) => permissionIdBySlug.get(slug));
    await tx.rolePermission.deleteMany({ where: { roleId: id, permissionId: { notIn: wanted.length ? wanted : ["-"] } } });
    for (const permissionId of wanted) {
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: id, permissionId } },
        create: { roleId: id, permissionId },
        update: {},
      });
      tally.add("role_permissions");
    }
  }

  // -- Delivery zones and their areas --------------------------------------
  for (const zone of deliveryZones) {
    const { areas, ...definition } = zone;
    await tx.deliveryZone.upsert({
      where: { id: zone.id },
      create: { ...definition, isActive: true },
      update: definition,
    });
    tally.add("delivery_zones");

    for (const area of areas) {
      const key = normalizeArea(area.label);
      const data = { label: area.label, lat: area.lat, lng: area.lng };
      await tx.zoneArea.upsert({
        where: { zoneId_area: { zoneId: zone.id, area: key } },
        create: { zoneId: zone.id, area: key, ...data },
        update: data,
      });
      tally.add("zone_areas");
    }
  }

  // -- Payment providers ----------------------------------------------------
  for (const provider of paymentProviders) {
    const id = deterministicId(ID_PREFIXES.paymentProvider, provider.kind);
    const data = toDbInput("PaymentProvider", provider);
    await tx.paymentProvider.upsert({
      where: { kind: data.kind },
      create: { id, ...data },
      update: data,
    });
    tally.add("payment_providers");
  }

  // -- Platform ledger accounts --------------------------------------------
  //
  // `findFirst` + `create` rather than `upsert`, because the constraint that
  // makes these unique is a *partial* index — `(kind, currency) WHERE ownerId IS
  // NULL` — and Prisma can only address a full one. The index still refuses a
  // duplicate if two seeders race; this just avoids provoking it.
  for (const kind of platformLedgerAccountKinds) {
    const data = toDbInput("LedgerAccount", { kind, currency: LEDGER_CURRENCY });
    const existing = await tx.ledgerAccount.findFirst({
      where: { kind: data.kind, ownerId: null, currency: LEDGER_CURRENCY },
      select: { id: true },
    });
    if (!existing) {
      await tx.ledgerAccount.create({
        data: { id: deterministicId(ID_PREFIXES.ledgerAccount, `${kind}:${LEDGER_CURRENCY}`), ...data, ownerId: null },
      });
    }
    tally.add("ledger_accounts");
  }

  // -- CMS collections ------------------------------------------------------
  //
  // The field schemas are `lib/mock/cms.ts::cmsCollections`, exported verbatim to
  // `data/cms-collections.json` rather than retyped — see that file's header.
  for (const [index, collection] of cmsCollections.entries()) {
    const data = toDbInput("CmsCollection", {
      label: collection.label,
      description: collection.description ?? "",
      icon: collection.icon,
      surface: collection.surface,
      previewHref: collection.previewHref ?? null,
      fields: collection.fields,
      creatable: Boolean(collection.creatable),
      orderable: Boolean(collection.orderable),
      titleField: collection.titleField,
      sort: index,
    });
    const id = toDbInput("CmsCollection", { id: collection.id }).id;
    await tx.cmsCollection.upsert({ where: { id }, create: { id, ...data }, update: data });
    tally.add("cms_collections");
  }

  // -- Notification templates ----------------------------------------------
  for (const template of notificationTemplates) {
    const id = deterministicId(ID_PREFIXES.notificationTemplate, `${template.audience}:${template.key}`);
    const data = toDbInput("NotificationTemplate", { ...template, providerRefs: {}, isActive: true });
    await tx.notificationTemplate.upsert({
      where: { key_audience: { key: template.key, audience: data.audience } },
      create: { id, ...data },
      update: data,
    });
    tally.add("notification_templates");
  }

  for (const [table, count] of Object.entries(tally.counts)) log.info(`  ${String(count).padStart(4)}  ${table}`);
  return tally.counts;
}

/**
 * Seed, in one transaction.
 *
 * All of it or none of it: a run that fails halfway through leaves a database
 * with permissions but no roles, which is harder to reason about than one that
 * has nothing. The timeout is generous because ~250 upserts against a cold
 * connection is slower than the 5-second default allows for, and a seeder that
 * times out on a slow laptop is a seeder people stop trusting.
 *
 * @param {{ databaseUrl?: string, logger?: { info: (message: string) => void } }} [options]
 */
export async function seedReferenceData(options = {}) {
  const log = options.logger ?? console;
  const prisma = new PrismaClient(
    options.databaseUrl ? { datasources: { db: { url: options.databaseUrl } } } : undefined,
  );

  const started = Date.now();
  try {
    log.info("seeding reference data…");
    const counts = await prisma.$transaction((tx) => seedInto(tx, log), {
      timeout: 120_000,
      maxWait: 10_000,
    });
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    log.info(`reference data seeded: ${total} rows across ${Object.keys(counts).length} tables in ${Date.now() - started}ms`);
    return counts;
  } finally {
    await prisma.$disconnect();
  }
}

export default seedReferenceData;
