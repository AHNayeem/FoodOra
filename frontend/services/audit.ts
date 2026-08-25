import type { AuditActor, AuditEntry, AuditQuery, CmsAuditEntry } from "@/types";
import type { CsvCell } from "@/lib/export";
import {
  actorsIn,
  byRecency,
  countByAction,
  dedupe,
  filterAudit,
  fromCmsAudit,
} from "@/lib/audit";
import { mockDelay } from "./http";

/**
 * audit.ts — reading the platform trail (Phase 15, G32).
 *
 * The seam. `stores/audit` holds what this device recorded and `stores/cms` holds
 * the content desk's own trail; this is the one place they are joined, so no
 * component has to know that the platform log has two sources. Phase E replaces
 * the body of `getAuditLog` with a paginated query against an `audit_log` table
 * and the signature stays put.
 *
 * The merge is the reason this file exists rather than the view reading the two
 * stores itself. §6 asks for CMS compatibility, and the honest reading of that is
 * "content edits appear in the platform log without the CMS store changing shape".
 * Adapting on read — `lib/audit.fromCmsAudit` — is what makes that true; copying
 * on write would have produced two records of one edit that drift apart the first
 * time somebody reverts a document.
 */

/** What the caller hands in — the two stores, unjoined. */
export interface AuditContext {
  entries: AuditEntry[];
  /** `stores/cms.audit`, adapted here rather than at the call site. */
  cms: CmsAuditEntry[];
}

export const emptyAuditContext: AuditContext = { entries: [], cms: [] };

/** What the screen needs: the rows, and the shape of everything behind them. */
export interface AuditLog {
  entries: AuditEntry[];
  /** Rows before the filter — so "3 of 214" is sayable. */
  total: number;
  /** Counts per action, over the *unfiltered* set, for the filter's chips. */
  counts: Record<string, number>;
  /** Everybody who appears, for the actor filter. */
  actors: AuditActor[];
}

/**
 * Everything, joined, filtered and newest first.
 *
 * The counts and the actor list are computed **before** the filter is applied, on
 * purpose: a filter whose own options disappear as you use it is a filter you
 * cannot get out of, which is the mistake the review queue's segments avoid the
 * same way.
 */
export async function getAuditLog(
  ctx: AuditContext,
  query: AuditQuery,
): Promise<AuditLog> {
  const all = dedupe([...ctx.entries, ...ctx.cms.map(fromCmsAudit)]).sort(byRecency);
  const entries = filterAudit(all, query).sort(byRecency);
  return mockDelay(
    {
      entries,
      total: all.length,
      counts: countByAction(all),
      actors: actorsIn(all),
    },
    80,
  );
}

/**
 * One entity's history, newest first.
 *
 * Kept beside the list rather than left to the caller because an entity's trail is
 * the second question the log answers — "what has happened to this order" — and it
 * has to join the same two sources. Nothing renders it yet; it is the seam the
 * order and customer detail screens will read when they grow a history panel.
 */
export async function getEntityAudit(
  ctx: AuditContext,
  entityId: string,
): Promise<AuditEntry[]> {
  const all = dedupe([...ctx.entries, ...ctx.cms.map(fromCmsAudit)]);
  return mockDelay(
    all.filter((entry) => entry.entityId === entityId).sort(byRecency),
    60,
  );
}

/**
 * The trail as spreadsheet rows.
 *
 * Rows only — `lib/export.toCsv` owns the encoding and the component owns the
 * header labels, exactly as the analytics export does, so a change to quoting or
 * to the byte-order mark reaches every export at once and the column names stay
 * translatable.
 *
 * The metadata is flattened into one `key=value` column rather than exploded into
 * a column per key. A log of nineteen action kinds has no common set of keys, and
 * a sparse forty-column sheet is harder to read in a spreadsheet than one cell
 * somebody can filter on.
 */
export function auditRows(entries: AuditEntry[]): CsvCell[][] {
  return entries.map((entry) => [
    entry.at,
    entry.actor.name,
    entry.actor.role,
    entry.action,
    entry.entity,
    entry.entityId,
    entry.description,
    Object.entries(entry.metadata)
      .filter(([, value]) => value !== null && value !== "")
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("; "),
  ]);
}
