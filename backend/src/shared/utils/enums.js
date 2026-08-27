/**
 * enums.js — the two-way enum translation the schema makes mandatory.
 *
 * `main.prisma` §6 states the problem and this file is the whole answer to it.
 * The schema stores enum labels in the frontend's kebab-case vocabulary via
 * `@map`, so a Postgres row reads `"rider-assigned"` exactly as the TypeScript
 * union does — **but the Prisma client does not**. It addresses an enum by its
 * member identifier and applies `@map` only at the SQL boundary, and an
 * identifier cannot contain a hyphen, so the two vocabularies can never coincide
 * for any mapped value:
 *
 *     await prisma.order.findMany({ where: { status: "completed" } })  // throws
 *     await prisma.order.findMany({ where: { status: "COMPLETED" } })  // ok
 *     order.status === "COMPLETED"                                      // always
 *
 * Leaving the translation out sends SCREAMING_CASE to a frontend whose unions
 * are kebab-case. Doing it by hand, for 127 enums, guarantees a wrong entry.
 *
 * So it is **derived, not written**: `Prisma.dmmf.datamodel` carries `dbName` for
 * every enum member — the `@map` value — and the model list says which field is
 * which enum. Add an enum member to the schema, regenerate, and the map has it.
 * There is nothing here to keep in step.
 *
 * An enum with no `@map` translates to itself, which is correct rather than a
 * fallback: its identifier *is* its stored label.
 */
import { Prisma } from "@foodora/database";

const { enums, models, types = [] } = Prisma.dmmf.datamodel;

/** `{ OrderStatusKind: { toApi: { COMPLETED: "completed" }, toDb: { completed: "COMPLETED" } } }` */
export const ENUM_MAPS = Object.freeze(
  Object.fromEntries(
    enums.map((definition) => {
      const toApi = {};
      const toDb = {};
      for (const member of definition.values) {
        const api = member.dbName ?? member.name;
        toApi[member.name] = api;
        toDb[api] = member.name;
        // An identifier is always accepted on the way in, so a caller that
        // already speaks Prisma's vocabulary is not punished for it.
        toDb[member.name] = member.name;
      }
      return [definition.name, { toApi: Object.freeze(toApi), toDb: Object.freeze(toDb) }];
    }),
  ),
);

/** `{ Order: { status: { enum: "OrderStatusKind", isList: false } } }` */
export const MODEL_ENUM_FIELDS = Object.freeze(
  Object.fromEntries(
    [...models, ...types].map((model) => [
      model.name,
      Object.freeze(
        Object.fromEntries(
          model.fields
            .filter((field) => field.kind === "enum")
            .map((field) => [field.name, { enum: field.type, isList: field.isList }]),
        ),
      ),
    ]),
  ),
);

function translate(direction, enumName, value) {
  const map = ENUM_MAPS[enumName];
  if (!map) throw new Error(`Unknown enum "${enumName}" — it is not in the generated schema.`);
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((entry) => translate(direction, enumName, entry));
  const translated = map[direction][value];
  if (translated === undefined) {
    throw new Error(`"${value}" is not a member of enum ${enumName}.`);
  }
  return translated;
}

/** `COMPLETED` → `"completed"`. Arrays and nullish values pass through. */
export const toApiEnum = (enumName, value) => translate("toApi", enumName, value);

/** `"completed"` → `COMPLETED`, and `COMPLETED` → `COMPLETED`. */
export const toDbEnum = (enumName, value) => translate("toDb", enumName, value);

/**
 * Translate every enum field of one row into the frontend's vocabulary.
 *
 * Shallow by design: relations come back as nested objects whose model name this
 * function cannot know, so a route that includes relations maps each one with
 * its own model. Guessing from the key name would be wrong the first time a
 * relation is not named after its model — `Order.vendor` is a `Vendor`, but
 * `Order.customer` is a `User`.
 */
export function toApiRow(modelName, row) {
  if (row === null || row === undefined) return row;
  if (Array.isArray(row)) return row.map((entry) => toApiRow(modelName, entry));
  const fields = MODEL_ENUM_FIELDS[modelName];
  if (!fields) throw new Error(`Unknown model "${modelName}" — it is not in the generated schema.`);

  const out = { ...row };
  for (const [field, { enum: enumName }] of Object.entries(fields)) {
    if (field in out) out[field] = toApiEnum(enumName, out[field]);
  }
  return out;
}

/**
 * The inverse, for a `data` or `where` object on the way in.
 *
 * Only translates keys that name an enum field and hold a plain value or array;
 * a filter object (`{ in: [...] }`, `{ not: ... }`) has its `in`/`notIn`/`not`/
 * `equals` members translated, which is every enum filter Prisma generates.
 */
export function toDbInput(modelName, input) {
  if (input === null || input === undefined) return input;
  const fields = MODEL_ENUM_FIELDS[modelName];
  if (!fields) throw new Error(`Unknown model "${modelName}" — it is not in the generated schema.`);

  const out = { ...input };
  for (const [field, { enum: enumName }] of Object.entries(fields)) {
    if (!(field in out)) continue;
    const value = out[field];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const filter = { ...value };
      for (const key of ["equals", "not", "in", "notIn", "has", "hasEvery", "hasSome"]) {
        if (key in filter) filter[key] = toDbEnum(enumName, filter[key]);
      }
      out[field] = filter;
    } else {
      out[field] = toDbEnum(enumName, value);
    }
  }
  return out;
}
