"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Inbox, Info, RotateCcw } from "lucide-react";
import type { CmsAuditEntry, CmsDocumentView } from "@/types";
import type { CmsCollectionSummary } from "@/services/cms";
import { titleOf } from "@/lib/cms";
import { getAuditLog, getCollections, getPendingDrafts } from "@/services/cms";
import { cmsCollectionById } from "@/lib/mock/cms";
import { useCms, useCmsContext } from "@/stores/cms";
import { DraftChip, StatusChip } from "@/components/admin/cms/status-chip";
import { DashIcon } from "@/components/directory/dash-icon";
import { Button } from "@/components/ui/button";

/**
 * CmsOverview — the content desk's front page (spec: Admin Panel → CMS,
 * Content Management).
 *
 * Three things, in the order they matter: what is waiting to be published, the
 * collections themselves, and who changed what (the audit trail). The honest
 * note at the top is not decoration — a publication in this prototype is real,
 * reversible and audited, but it lives in *this* browser, and an operator should
 * be told that before they wonder why a colleague cannot see their edit.
 */
export function CmsOverview() {
  const t = useTranslations("cms");
  const format = useFormatter();

  const ctx = useCmsContext();
  const hydrated = useCms((s) => s.hydrated);
  const resetContent = useCms((s) => s.resetContent);
  const messages = useCms((s) => s.messages);

  const [collections, setCollections] = useState<CmsCollectionSummary[] | null>(null);
  const [drafts, setDrafts] = useState<CmsDocumentView[]>([]);
  const [audit, setAudit] = useState<CmsAuditEntry[]>([]);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    let live = true;

    Promise.all([getCollections(ctx), getPendingDrafts(ctx), getAuditLog(ctx, 12)]).then(
      ([summaries, pending, log]) => {
        if (!live) return;
        setCollections(summaries);
        setDrafts(pending);
        setAudit(log);
      },
    );

    return () => {
      live = false;
    };
  }, [ctx, hydrated, reloadKey]);

  const totalDocuments = collections?.reduce((n, c) => n + c.total, 0) ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h2 text-ink">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-body">{t("subtitle", { count: totalDocuments })}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetContent();
            toast.success(t("toastReset"));
            setReloadKey((n) => n + 1);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-pill border border-line px-4 text-sm font-semibold text-body transition-colors hover:bg-surface"
        >
          <RotateCcw className="size-4" aria-hidden />
          {t("resetContent")}
        </button>
      </header>

      {/* The honest limit, stated where it matters */}
      <p className="flex items-start gap-2.5 rounded-panel border border-line bg-surface p-4 text-sm text-body">
        <Info className="mt-0.5 size-4.5 shrink-0 text-primary" aria-hidden />
        {t("deviceNote")}
      </p>

      {/* Waiting to publish */}
      {drafts.length > 0 && (
        <section>
          <h2 className="text-h3 text-ink">{t("pendingTitle", { count: drafts.length })}</h2>
          <ul className="mt-4 flex flex-col gap-2">
            {drafts.map((view) => {
              const def = cmsCollectionById.get(view.document.collection);
              if (!def) return null;
              return (
                <li
                  key={view.document.id}
                  className="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface p-4"
                >
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-warning/15 text-warning">
                    <AlertTriangle className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/cms/${def.id}/${view.document.id}`}
                      className="font-semibold text-ink hover:text-primary"
                    >
                      {titleOf(def, view.document, view.editing)}
                    </Link>
                    <p className="text-xs text-muted">{def.label}</p>
                  </div>
                  {view.hasDraft && <DraftChip />}
                  <StatusChip status={view.status} />
                  <Button
                    href={`/admin/cms/${def.id}/${view.document.id}`}
                    variant="outline"
                    size="sm"
                  >
                    {t("review")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Collections */}
      <section>
        <h2 className="text-h3 text-ink">{t("collectionsTitle")}</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(collections ?? []).map((summary) => (
            <li key={summary.def.id}>
              <Link
                href={`/admin/cms/${summary.def.id}`}
                className="group flex h-full flex-col rounded-panel border border-line bg-surface p-5 transition-colors hover:border-primary"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-pill bg-primary/10 text-primary">
                  <DashIcon name={summary.def.icon} className="size-5" />
                </span>
                <h3 className="mt-4 font-bold text-ink group-hover:text-primary">
                  {summary.def.label}
                </h3>
                <p className="mt-1 flex-1 text-sm text-body">{summary.def.description}</p>

                <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <div className="inline-flex items-center gap-1">
                    <dt className="text-muted">{t("countDocuments")}</dt>
                    <dd className="font-bold text-ink">{summary.total}</dd>
                  </div>
                  {summary.drafts > 0 && (
                    <div className="inline-flex items-center gap-1">
                      <dt className="text-muted">{t("countDrafts")}</dt>
                      <dd className="font-bold text-warning">{summary.drafts}</dd>
                    </div>
                  )}
                  {summary.scheduled > 0 && (
                    <div className="inline-flex items-center gap-1">
                      <dt className="text-muted">{t("countScheduled")}</dt>
                      <dd className="font-bold text-primary">{summary.scheduled}</dd>
                    </div>
                  )}
                  {summary.gaps.length > 0 && (
                    <div className="inline-flex items-center gap-1">
                      <dt className="text-muted">{t("countGaps")}</dt>
                      <dd className="font-bold text-warning">
                        {summary.gaps.map((l) => l.toUpperCase()).join(", ")}
                      </dd>
                    </div>
                  )}
                </dl>

                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  {t("open")}
                  <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Audit trail */}
        <section>
          <h2 className="text-h3 text-ink">{t("auditTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("auditHint")}</p>
          {audit.length === 0 ? (
            <p className="mt-4 rounded-panel border border-dashed border-line p-6 text-center text-sm text-muted">
              {t("auditEmpty")}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
              {audit.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{entry.title}</p>
                    <p className="text-xs text-muted">
                      {t(`action.${entry.action}`)} ·{" "}
                      {cmsCollectionById.get(entry.collection)?.label ?? entry.collection}
                    </p>
                  </div>
                  <p className="shrink-0 text-end text-xs text-muted">
                    <span className="block font-semibold text-body">{entry.by}</span>
                    {format.dateTime(new Date(entry.at), {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Contact messages — the other thing content produces */}
        <section>
          <h2 className="text-h3 text-ink">{t("messagesTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("messagesHint")}</p>
          {messages.length === 0 ? (
            <p className="mt-4 flex flex-col items-center gap-2 rounded-panel border border-dashed border-line p-6 text-center text-sm text-muted">
              <Inbox className="size-6" aria-hidden />
              {t("messagesEmpty")}
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {messages.slice(0, 6).map((message) => (
                <li key={message.id} className="rounded-panel border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{message.name}</p>
                    <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-xs font-bold text-body">
                      {t(`topics.${message.topic}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{message.email}</p>
                  <p className="mt-2 line-clamp-3 text-sm text-body">{message.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
