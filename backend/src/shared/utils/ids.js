/**
 * ids.js — application-generated, prefixed, sortable ids.
 *
 * `main.prisma` §1: no column has a generating default, so every `create` passes
 * an id. The format is a prefix plus a ULID — `usr_01J8F3K2M7QX9V4B6C8D0EGHJK` —
 * and both halves earn their place:
 *
 *  - the **prefix** is what makes an id self-describing in a log line and what
 *    keeps the frontend's existing deep links resolving after the cutover;
 *  - the **ULID** sorts lexicographically by creation time, so `ORDER BY id` is
 *    chronological and a B-tree index on it appends rather than fragmenting.
 *    A UUIDv4 would give neither.
 */
import { createHash } from "node:crypto";
import { ulid } from "ulid";
import { KNOWN_PREFIXES, PREFIX_PATTERN } from "../constants/id-prefixes.js";

/**
 * Mint an id.
 *
 * Refuses an unregistered prefix. That is the point of the registry: a typo
 * (`usre_`) is otherwise a valid-looking row that nothing will ever find again,
 * and by the time anyone notices it needs a migration.
 *
 * @param {string} prefix e.g. `"usr_"` — trailing underscore included.
 * @param {Date} [at] Fixed timestamp, for a deterministic seed or a test.
 */
export function newId(prefix, at) {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(`"${prefix}" is not a valid id prefix — expected two to six lower-case letters and "_".`);
  }
  if (!KNOWN_PREFIXES.has(prefix)) {
    throw new Error(
      `"${prefix}" is not a registered id prefix. Add it to shared/constants/id-prefixes.js ` +
        "with the module that mints it.",
    );
  }
  return `${prefix}${ulid(at ? at.getTime() : undefined)}`;
}

/** `"usr_01J8…"` → `"usr_"`, or null when the id carries no prefix. */
export function prefixOf(id) {
  const match = /^([a-z]{2,6}_)/.exec(String(id ?? ""));
  return match ? match[1] : null;
}

/** Whether an id looks like one of ours and carries the prefix expected of it. */
export function hasPrefix(id, prefix) {
  return typeof id === "string" && id.startsWith(prefix) && id.length > prefix.length;
}

/** Crockford base32 — ULID's alphabet, minus I, L, O and U. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A stable id for a row whose identity is its natural key.
 *
 * Reference data needs ids that are the same in every database: a seed run twice
 * must not produce two `Permission` rows for `orders.view`, and the row for
 * `orders.view` in staging should be the row for `orders.view` in production so
 * a `RolePermission` grant exported from one means something in the other. A
 * ULID is random by design and gives neither.
 *
 * So the id is derived from the natural key by hash, rendered in ULID's own
 * alphabet and length. It is not a ULID — it does not encode a time and does not
 * sort chronologically — but it is indistinguishable in shape, which keeps one
 * id format across the whole database and lets `idSchema` validate both.
 *
 * @param {string} prefix e.g. `"prm_"`
 * @param {string} naturalKey the thing that makes the row unique — `"orders.view"`
 */
export function deterministicId(prefix, naturalKey) {
  if (!KNOWN_PREFIXES.has(prefix)) {
    throw new Error(`"${prefix}" is not a registered id prefix.`);
  }
  const digest = createHash("sha256").update(`${prefix}${naturalKey}`).digest();
  let out = "";
  for (let index = 0; index < 26; index += 1) out += CROCKFORD[digest[index] % 32];
  // A ULID's first character encodes the high bits of its timestamp and never
  // exceeds "7". Matching that keeps these parseable by a strict ULID reader.
  return `${prefix}${CROCKFORD[digest[0] % 8]}${out.slice(1)}`;
}
