"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ExternalLink, FileQuestion, Plus } from "lucide-react";
import { locales } from "@/frontend/config/i18n/config";
import type { CmsCollectionId, CmsDocumentView, CmsStatus } from "@/frontend/types";
import { titleOf, translationGaps } from "@/frontend/lib/cms";
import { createDocument, listDocuments, moveDocument } from "@/frontend/services/cms";
import { cmsCollectionById } from "@/frontend/lib/mock/cms";
import { useAuth } from "@/frontend/stores/auth";
import { useCms, useCmsContext } from "@/frontend/stores/cms";
import { DraftChip, StatusChip } from "@/frontend/components/admin/cms/status-chip";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { cn } from "@/frontend/lib/utils";

const STATUSES: (CmsStatus | null)[] = [null, "published", "draft", "scheduled", "archived"];

/**
 * CollectionList — every document in one collection.
 *
 * The columns answer the three questions an editor actually has: is it live,
 * does it have a change waiting, and is it translated. Ordering is only offered
 * where order means something (the banner strip, the nav, the craving rail), and
 * it moves one document past its neighbour rather than renumbering the list.
 */
export function CollectionList({ collection }: { collection: CmsCollectionId }) {
  const t = useTranslations("cms");
  const format = useFormatter();
  const router = useRouter();

  const ctx = useCmsContext();
  const hydrated = useCms((s) => s.hydrated);
  const commit = useCms((s) => s.commit);
  const by = useAuth((s) => s.user?.name) ?? t("unknownEditor");

  const [views, setViews] = useState<CmsDocumentView[] | null>(null);
  /** Bumped after a mutation so the effect below refetches. */
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<CmsStatus | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const def = cmsCollectionById.get(collection);

  useEffect(() => {
    if (!hydrated) return;
    let live = true;
    listDocuments(collection, ctx).then((list) => {
      if (live) setViews(list);
    });
    return () => {
      live = false;
    };
  }, [collection, ctx, hydrated, reloadKey]);

  const visible = useMemo(() => {
    if (!views || !def) return [];
    const q = search.trim().toLowerCase();
    return views.filter((view) => {
      if (status && view.status !== status) return false;
      if (!status && view.status === "archived") return false;
      if (!q) return true;
      const title = titleOf(def, view.document, view.editing).toLowerCase();
      return title.includes(q) || view.document.key.toLowerCase().includes(q);
    });
  }, [views, def, search, status]);

  if (!def) return null;

  async function onCreate() {
    setBusy(true);
    const result = await createDocument(collection, ctx, by);
    setBusy(false);
    if (result.error || !result.data) {
      toast.error(t(result.error!.replace(/^cms\./, "")));
      return;
    }
    commit(result.data);
    toast.success(t("toastCreated"));
    router.push(`/admin/cms/${collection}/${result.data.documentId}`);
  }

  async function onMove(documentId: string, direction: "up" | "down") {
    setBusy(true);
    const result = await moveDocument(documentId, direction, ctx, by);
    setBusy(false);
    if (result.error || !result.data) {
      if (result.error) toast.error(t(result.error.replace(/^cms\./, "")));
      return;
    }
    commit(result.data);
    setReloadKey((n) => n + 1);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/admin/cms" className="font-semibold text-primary hover:underline">
          {t("title")}
        </Link>
        <span className="text-muted">/</span>
        <span className="font-semibold text-ink">{def.label}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h2 text-ink">{def.label}</h1>
          <p className="mt-1 max-w-2xl text-body">{def.description}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {t("surface", { surface: def.surface })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {def.previewHref && (
            <Button href={def.previewHref} variant="outline" size="sm" target="_blank">
              <ExternalLink className="size-4" aria-hidden />
              {t("viewSurface")}
            </Button>
          )}
          {def.creatable && (
            <Button size="sm" disabled={busy} onClick={() => void onCreate()}>
              <Plus className="size-4" aria-hidden />
              {t("newDocument")}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {STATUSES.map((value) => (
          <button
            key={value ?? "all"}
            type="button"
            onClick={() => setStatus(value)}
            aria-current={status === value ? "true" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-pill border px-3 text-sm font-semibold transition-colors",
              status === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-line bg-surface text-body hover:text-ink",
            )}
          >
            {value ? t(`status.${value}`) : t("filterAll")}
          </button>
        ))}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="ms-auto h-9 w-full max-w-56"
        />
      </div>

      {/* Documents */}
      {views === null ? (
        <div className="mt-8 flex min-h-40 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-panel border border-dashed border-line py-16 text-center">
          <FileQuestion className="size-10 text-muted" aria-hidden />
          <p className="text-lg font-semibold text-ink">{t("listEmpty")}</p>
          <p className="max-w-sm text-body">{t("listEmptyBody")}</p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {visible.map((view, index) => {
            const gaps = translationGaps(view.coverage);
            return (
              <li
                key={view.document.id}
                className="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface p-4"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/cms/${collection}/${view.document.id}`}
                    className="font-semibold text-ink hover:text-primary"
                  >
                    {titleOf(def, view.document, view.editing)}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <code className="font-mono">{view.document.key}</code>
                    <span>
                      {t("updatedBy", {
                        by: view.document.updatedBy,
                        when: format.dateTime(new Date(view.document.updatedAt), {
                          day: "numeric",
                          month: "short",
                        }),
                      })}
                    </span>
                    {gaps.length > 0 && (
                      <span className="font-semibold text-warning">
                        {t("missingLocales", {
                          locales: gaps.map((l) => l.toUpperCase()).join(", "),
                        })}
                      </span>
                    )}
                    {gaps.length === 0 && locales.length > 1 && (
                      <span className="font-semibold text-success">{t("fullyTranslated")}</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {view.hasDraft && <DraftChip />}
                  <StatusChip status={view.status} />

                  {def.orderable && (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={t("moveUp")}
                        disabled={busy || index === 0}
                        onClick={() => void onMove(view.document.id, "up")}
                        className="inline-flex size-8 items-center justify-center rounded-pill border border-line text-body transition-colors hover:bg-surface-muted disabled:opacity-40"
                      >
                        <ChevronUp className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={t("moveDown")}
                        disabled={busy || index === visible.length - 1}
                        onClick={() => void onMove(view.document.id, "down")}
                        className="inline-flex size-8 items-center justify-center rounded-pill border border-line text-body transition-colors hover:bg-surface-muted disabled:opacity-40"
                      >
                        <ChevronDown className="size-4" aria-hidden />
                      </button>
                    </span>
                  )}

                  <Button
                    href={`/admin/cms/${collection}/${view.document.id}`}
                    variant="outline"
                    size="sm"
                  >
                    {t("edit")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
