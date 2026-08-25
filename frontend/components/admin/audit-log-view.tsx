"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Download,
  Inbox,
  Search,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { AuditEntry, AuditQuery } from "@/types";
import type { AuditLog } from "@/services/audit";
import { auditRows, getAuditLog } from "@/services/audit";
import { useAudit } from "@/stores/audit";
import { useAuth } from "@/stores/auth";
import { useCms } from "@/stores/cms";
import { useCustomers } from "@/stores/customers";
import { useOnboarding } from "@/stores/onboarding";
import { useOrders } from "@/stores/orders";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  EMPTY_AUDIT_QUERY,
  isEmptyAuditQuery,
  isHighImpact,
} from "@/lib/audit";
import { permissionsFor } from "@/lib/rbac";
import { downloadCsv, exportFilename, toCsv } from "@/lib/export";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Rows rendered before "show more". */
const PAGE = 40;

/**
 * AdminAuditLog — who changed what on this platform (Phase 15, G32).
 *
 * The screen G32 said did not exist. Before this the only trace of an admin
 * decision was the decided entity itself: an order that says `cancelled`, a
 * restaurant that says `suspended`, a settlement that says `paid`. Each of those
 * answers *what* and none of them answers *who* — and a prototype that claims an
 * admin panel with roles has to be able to answer the second one.
 *
 * Two things about the shape of this screen:
 *
 *  - **It is one list, not a list per subsystem.** The point of a platform trail
 *    is that an incident crosses subsystems: a refund, a block and a payout
 *    correction on the same afternoon are one story, and three separate logs are
 *    three places to fail to notice it. The filters are how a reader narrows it
 *    back down, and every one of them is over the whole set.
 *  - **The content desk's trail is in it.** Read through `services/audit`, which
 *    adapts `CmsAuditEntry` on the way past; `stores/cms` is untouched and its own
 *    richer view of the same edits is still on `/admin/cms`. That is §6's "keep
 *    existing CMS audit compatibility" — the platform log gained the content
 *    edits, the content desk lost nothing.
 *
 * The permission reference at the bottom is Phase 14 made visible: the effective
 * rights of whoever is reading, computed by `lib/rbac.permissionsFor` rather than
 * listed by hand, so it cannot describe a permission set the gates do not enforce.
 */
export function AdminAuditLog() {
  const t = useTranslations("audit");
  const format = useFormatter();

  const user = useAuth((s) => s.user);
  const entries = useAudit((s) => s.entries);
  const auditHydrated = useAudit((s) => s.hydrated);
  const cms = useCms((s) => s.audit);
  const ordersHydrated = useOrders((s) => s.hydrated);

  const [log, setLog] = useState<AuditLog | null>(null);
  const [query, setQuery] = useState<AuditQuery>(EMPTY_AUDIT_QUERY);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    // The seed is built from the orders, the accounts and the applications this
    // device holds (`lib/mock/audit`), so all three have to be down before the
    // audit store's own rehydration seeds itself.
    useOrders.persist.rehydrate();
    useCustomers.persist.rehydrate();
    useOnboarding.persist.rehydrate();
    void useCms.persist.rehydrate();
    // Seeded after its own rehydration rather than only inside
    // `onRehydrateStorage`, because the seed is refused while the order book is
    // still empty (see `stores/audit.seed`) and on a cold load this screen is
    // where all four stores come up at once.
    void Promise.resolve(useAudit.persist.rehydrate()).then(() =>
      useAudit.getState().seed(),
    );
  }, []);

  /**
   * Joined in the seam, not here.
   *
   * `ctx` is the two stores handed over unmerged; `getAuditLog` adapts and sorts.
   * Memoised on the two arrays so a keystroke in the search box does not rebuild
   * an identity the effect below depends on.
   */
  const ctx = useMemo(() => ({ entries, cms }), [entries, cms]);

  useEffect(() => {
    if (!auditHydrated || !ordersHydrated) return;
    let live = true;
    getAuditLog(ctx, query).then((next) => {
      if (live) setLog(next);
    });
    return () => {
      live = false;
    };
  }, [ctx, query, auditHydrated, ordersHydrated]);

  function patch(next: Partial<AuditQuery>) {
    setQuery((q) => ({ ...q, ...next }));
    setLimit(PAGE);
  }

  const permissions = useMemo(() => permissionsFor(user), [user]);
  const visible = useMemo(() => log?.entries.slice(0, limit) ?? [], [log, limit]);
  const highImpact = useMemo(
    () => (log ? log.entries.filter(isHighImpact).length : 0),
    [log],
  );

  /**
   * Export what is on screen, not everything.
   *
   * The filter is the point of the export — somebody takes a week of payout
   * activity to a spreadsheet, not four hundred unrelated lines — and an export
   * that silently ignored the filter would be the more surprising of the two.
   */
  function exportCsv() {
    if (!log) return;
    const csv = toCsv(
      [
        t("csv.at"),
        t("csv.actor"),
        t("csv.role"),
        t("csv.action"),
        t("csv.entity"),
        t("csv.entityId"),
        t("csv.description"),
        t("csv.metadata"),
      ],
      auditRows(log.entries),
    );
    const stamp = (value: string | null) => value ?? new Date().toISOString().slice(0, 10);
    downloadCsv(
      exportFilename({
        vendor: "platform",
        report: "audit",
        from: stamp(query.from),
        to: stamp(query.to),
      }),
      csv,
    );
  }

  if (!log) {
    return (
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-card bg-surface" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="size-4" aria-hidden />
          {t("export")}
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("statTotal")}
          value={String(log.total)}
          icon={ScrollText}
          hint={t("statTotalHint")}
        />
        <StatCard
          label={t("statHighImpact")}
          value={String(highImpact)}
          icon={ShieldAlert}
          hint={t("statHighImpactHint")}
        />
        <StatCard
          label={t("statActors")}
          value={String(log.actors.length)}
          icon={Users}
          hint={t("statActorsHint")}
        />
      </div>

      {/* This device only, said on screen — the same admission every prototype
          store makes, and the one a reviewer would otherwise have to guess at. */}
      <p className="rounded-field bg-surface-muted p-3 text-xs text-muted">
        {t("deviceNote")}
      </p>

      <section className="space-y-3 rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              value={query.text}
              onChange={(e) => patch({ text: e.target.value })}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              className="ps-9"
            />
          </label>
          {!isEmptyAuditQuery(query) && (
            <Button variant="ghost" size="sm" onClick={() => setQuery(EMPTY_AUDIT_QUERY)}>
              <X className="size-4" aria-hidden />
              {t("clear")}
            </Button>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label={t("filterAction")}
            value={query.action ?? ""}
            onChange={(value) =>
              patch({ action: (value || null) as AuditQuery["action"] })
            }
            options={[
              { value: "", label: t("filterAnyAction") },
              ...AUDIT_ACTIONS.map((action) => ({
                value: action,
                // `action.order.intervened` — the slug's own dot is the message
                // path's nesting, because next-intl forbids a `.` inside a key.
                label: `${t(`action.${action}`)} (${log.counts[action] ?? 0})`,
              })),
            ]}
          />
          <Select
            label={t("filterEntity")}
            value={query.entity ?? ""}
            onChange={(value) =>
              patch({ entity: (value || null) as AuditQuery["entity"] })
            }
            options={[
              { value: "", label: t("filterAnyEntity") },
              ...AUDIT_ENTITIES.map((entity) => ({
                value: entity,
                label: t(`entity.${entity}`),
              })),
            ]}
          />
          <Select
            label={t("filterActor")}
            value={query.actorId ?? ""}
            onChange={(value) => patch({ actorId: value || null })}
            options={[
              { value: "", label: t("filterAnyActor") },
              ...log.actors.map((actor) => ({ value: actor.id, label: actor.name })),
            ]}
          />
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("filterFrom")}
            </span>
            <Input
              type="date"
              value={query.from ?? ""}
              onChange={(e) => patch({ from: e.target.value || null })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("filterTo")}
            </span>
            <Input
              type="date"
              value={query.to ?? ""}
              onChange={(e) => patch({ to: e.target.value || null })}
            />
          </label>
        </div>

        <p className="text-xs font-semibold text-muted tabular-nums">
          {t("showing", { shown: log.entries.length, total: log.total })}
        </p>
      </section>

      {log.entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
            <Inbox className="size-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink">{t("empty")}</p>
          <p className="max-w-sm text-xs text-muted">{t("emptyHint")}</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {visible.map((entry) => (
              <AuditRow key={entry.id} entry={entry} format={format} />
            ))}
          </ul>
          {log.entries.length > visible.length && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                {t("showMore", { count: log.entries.length - visible.length })}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Phase 14, made visible. */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <ShieldCheck className="size-4 text-muted" aria-hidden />
          {t("permissionsTitle")}
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {t("permissionsHint", { role: user ? t(`role.${user.role}`) : "—" })}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {permissions.map((permission) => (
            <span
              key={permission}
              className="rounded-pill bg-surface-muted px-2.5 py-1 font-mono text-[11px] font-semibold text-body"
            >
              {permission}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * One line of the trail.
 *
 * The description carries the sentence and the chips carry the facts a reader
 * scans by — when, who, and what kind of act. The metadata is rendered under it
 * rather than hidden behind a disclosure: there are at most six keys on any entry
 * and the whole value of an audit line is that nothing about it is one click away.
 */
function AuditRow({
  entry,
  format,
}: {
  entry: AuditEntry;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations("audit");
  const high = isHighImpact(entry);
  const metadata = Object.entries(entry.metadata).filter(
    ([, value]) => value !== null && value !== "",
  );

  return (
    <li className="p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-pill px-2.5 py-1 text-xs font-bold",
            high ? "bg-danger/10 text-danger" : "bg-surface-muted text-body",
          )}
        >
          {t(`action.${entry.action}`)}
        </span>
        <span className="text-sm font-bold text-ink">{entry.actor.name}</span>
        <span className="rounded-pill border border-line px-2 py-0.5 text-[11px] font-semibold text-muted">
          {t(`role.${entry.actor.role}`)}
        </span>
        <span className="ms-auto text-xs text-muted tabular-nums">
          {format.dateTime(new Date(entry.at), {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <p className="mt-1.5 text-sm text-body">{entry.description}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span className="font-semibold">{t(`entity.${entry.entity}`)}</span>
        <span className="font-mono">{entry.entityId}</span>
        {metadata.map(([key, value]) => (
          <span key={key} className="rounded bg-surface-muted px-1.5 py-0.5 font-mono">
            {key}={String(value)}
          </span>
        ))}
      </div>
    </li>
  );
}

/** A labelled native select. Native because it is the control a phone does best. */
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
