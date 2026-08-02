"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  EyeOff,
  History,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { localeMeta, locales, type Locale } from "@/frontend/config/i18n/config";
import type {
  CmsCollectionDef,
  CmsDocumentView,
  CmsFieldError,
  CmsRevision,
  CmsValue,
  CmsValues,
} from "@/frontend/types";
import { coverageOf, fieldsOf, titleOf, validateValues } from "@/frontend/lib/cms";
import {
  discardDraft,
  getDocument,
  getRevisions,
  publishDocument,
  revertDocument,
  saveDocument,
  setArchived,
  unpublishDocument,
} from "@/frontend/services/cms";
import { cmsCollectionById } from "@/frontend/lib/mock/cms";
import { useAuth } from "@/frontend/stores/auth";
import { useCms, useCmsContext } from "@/frontend/stores/cms";
import { DocumentFields } from "@/frontend/components/admin/cms/field-editors";
import { DraftChip, StatusChip } from "@/frontend/components/admin/cms/status-chip";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";

/**
 * DocumentEditor — the one editor every collection uses.
 *
 * What it is careful about:
 *
 * - **Draft and published are separate.** Saving leaves a draft; the site keeps
 *   serving the published values until someone presses publish. That is why the
 *   publish bar can offer *discard* — a change can be abandoned without a
 *   revision, which a single-value editor could never do.
 * - **Validation runs twice, deliberately.** Inline errors come from
 *   `validateValues` (pure, so the flow script checks the same rules), and the
 *   seam re-runs it on save. A form open since before a field became required is
 *   exactly the case a disabled button does not cover.
 * - **A publish is reversible.** It snapshots the values it replaces, so the
 *   history below is complete and *revert* is a real action rather than an undo
 *   stack that dies with the tab.
 * - **Locales are edited one at a time.** The tabs switch which locale the
 *   localized fields write to; an unauthored locale keeps its message-catalog
 *   translation, so a half-translated document is safe to publish.
 */
export function DocumentEditor({ documentId }: { documentId: string }) {
  const t = useTranslations("cms");
  const format = useFormatter();
  const router = useRouter();

  const ctx = useCmsContext();
  const hydrated = useCms((s) => s.hydrated);
  const commit = useCms((s) => s.commit);
  const editor = useAuth((s) => s.user);
  const by = editor?.name ?? t("unknownEditor");

  const [view, setView] = useState<CmsDocumentView | null>(null);
  const [revisions, setRevisions] = useState<CmsRevision[]>([]);
  const [values, setValues] = useState<CmsValues>({});
  const [locale, setLocale] = useState<Locale>("en");
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CmsFieldError[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  /** Bumped after a mutation so the effect below refetches. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    let live = true;

    Promise.all([getDocument(documentId, ctx), getRevisions(documentId, ctx)]).then(
      ([next, history]) => {
        if (!live) return;
        setView(next);
        setRevisions(history);
        // Only adopt the stored values when nothing is being typed: a refetch
        // must never overwrite an edit in progress.
        setValues((current) => (next && !dirtyRef.current ? next.editing : current));
      },
    );

    return () => {
      live = false;
    };
    // `dirty` is read through a ref on purpose — it must not retrigger the fetch.
  }, [documentId, ctx, hydrated, reloadKey]);

  const def: CmsCollectionDef | undefined = view
    ? cmsCollectionById.get(view.document.collection)
    : undefined;

  const fields = useMemo(
    () => (def && view ? fieldsOf(def, view.document) : []),
    [def, view],
  );

  const errors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const error of fieldErrors) {
      map[error.path] = t(error.error.replace(/^cms\./, ""), error.params ?? {});
    }
    return map;
  }, [fieldErrors, t]);

  const coverage = useMemo(
    () => (def && view ? coverageOf(def, view.document, values) : null),
    [def, view, values],
  );

  if (!hydrated || !view || !def) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  const doc = view.document;
  const title = titleOf(def, doc, values);
  const fallbacks = doc.fallbacks ?? {};

  function markClean() {
    dirtyRef.current = false;
    setDirty(false);
  }

  function change(key: string, value: CmsValue | undefined) {
    dirtyRef.current = true;
    setDirty(true);
    setValues((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  /** Client-side gate; the seam re-checks. Returns true when it may proceed. */
  function checkLocally(): boolean {
    const found = validateValues(def!, doc, values);
    setFieldErrors(found);
    if (found.length > 0) toast.error(t("errors.invalid"));
    return found.length === 0;
  }

  async function save(publish: boolean) {
    if (!checkLocally()) return;
    setBusy(true);
    const result = await saveDocument({ documentId, values, publish, by }, ctx);
    setBusy(false);

    if (result.error || !result.data) {
      toast.error(t((result.error ?? "cms.errors.invalid").replace(/^cms\./, "")));
      return;
    }
    if (!result.data.mutation) {
      setFieldErrors(result.data.errors);
      toast.error(t("errors.invalid"));
      return;
    }

    commit(result.data.mutation);
    markClean();
    setFieldErrors([]);
    toast.success(publish ? t("toastPublished") : t("toastSaved"));
    setReloadKey((n) => n + 1);
  }

  async function run(
    action: () => Promise<{ error: string | null }>,
    successKey: string,
    after?: () => void,
  ) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (result.error) {
      toast.error(t(result.error.replace(/^cms\./, "")));
      return;
    }
    toast.success(t(successKey));
    after?.();
    setReloadKey((n) => n + 1);
  }

  const publishedNothing = !doc.publishedAt;

  return (
    <div className="pb-24">
      {/* Breadcrumb + heading */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/admin/cms" className="font-semibold text-primary hover:underline">
          {t("title")}
        </Link>
        <span className="text-muted">/</span>
        <Link
          href={`/admin/cms/${def.id}`}
          className="font-semibold text-primary hover:underline"
        >
          {def.label}
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h2 truncate text-ink">{title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusChip status={view.status} />
            {view.hasDraft && <DraftChip />}
            <span>
              {t("lastSaved", {
                by: doc.updatedBy,
                when: format.dateTime(new Date(doc.updatedAt), {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </span>
          </p>
        </div>

        {def.previewHref && (
          <Button href={def.previewHref} variant="outline" size="sm" target="_blank">
            <ExternalLink className="size-4" aria-hidden />
            {t("viewSurface")}
          </Button>
        )}
      </div>

      {/* Locale tabs + coverage */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {locales.map((code) => {
          const percent = coverage ? Math.round(coverage[code] * 100) : 100;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-current={locale === code ? "true" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-pill border px-3 text-sm font-semibold transition-colors",
                locale === code
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-line bg-surface text-body hover:text-ink",
              )}
            >
              <span aria-hidden>{localeMeta[code].flag}</span>
              {localeMeta[code].native}
              <span className={cn("text-xs", percent === 100 ? "text-success" : "text-muted")}>
                {percent}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Fields */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="rounded-panel border border-line bg-surface p-5 md:p-6">
          <DocumentFields
            fields={fields}
            values={values}
            locale={locale}
            errors={errors}
            fallbacks={fallbacks}
            onChange={change}
          />
        </div>

        {/* Sidebar: schedule, history, danger */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-panel border border-line bg-surface p-5">
            <h2 className="text-sm font-bold text-ink">{t("scheduleTitle")}</h2>
            <p className="mt-1 text-xs text-muted">{t("scheduleHint")}</p>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t("publishAt")}</dt>
                <dd className="font-semibold text-ink">
                  {doc.publishAt
                    ? format.dateTime(new Date(doc.publishAt), { day: "numeric", month: "short" })
                    : t("immediately")}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t("unpublishAt")}</dt>
                <dd className="font-semibold text-ink">
                  {doc.unpublishAt
                    ? format.dateTime(new Date(doc.unpublishAt), { day: "numeric", month: "short" })
                    : t("never")}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-panel border border-line bg-surface p-5">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-sm font-bold text-ink"
            >
              <span className="inline-flex items-center gap-2">
                <History className="size-4 text-muted" aria-hidden />
                {t("historyTitle")}
              </span>
              <span className="text-xs font-semibold text-muted">{revisions.length}</span>
            </button>

            {showHistory &&
              (revisions.length === 0 ? (
                <p className="mt-3 text-xs text-muted">{t("historyEmpty")}</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {revisions.map((revision) => (
                    <li
                      key={revision.id}
                      className="flex items-center justify-between gap-2 rounded-field border border-line px-3 py-2"
                    >
                      <span className="min-w-0 text-xs">
                        <span className="block font-semibold text-ink">
                          {format.dateTime(new Date(revision.at), {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="block truncate text-muted">
                          {t(`reason.${revision.reason}`)} · {revision.by}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(
                            async () => {
                              const result = await revertDocument(documentId, revision.id, ctx, by);
                              if (result.data) commit(result.data);
                              return result;
                            },
                            "toastReverted",
                            markClean,
                          )
                        }
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-pill border border-line px-2.5 text-xs font-semibold text-body hover:text-primary"
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        {t("revert")}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </section>

          {!doc.locked && (
            <section className="rounded-panel border border-danger/30 bg-surface p-5">
              <h2 className="text-sm font-bold text-ink">{t("dangerTitle")}</h2>
              <p className="mt-1 text-xs text-muted">{t("dangerHint")}</p>
              <div className="mt-3 flex flex-col gap-2">
                {view.status === "published" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const result = await unpublishDocument(documentId, ctx, by);
                        if (result.data) commit(result.data);
                        return result;
                      }, "toastUnpublished")
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-pill border border-line text-sm font-semibold text-body hover:bg-surface-muted"
                  >
                    <EyeOff className="size-4" aria-hidden />
                    {t("unpublish")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      async () => {
                        const result = await setArchived(documentId, !doc.archivedAt, ctx, by);
                        if (result.data) commit(result.data);
                        return result;
                      },
                      doc.archivedAt ? "toastRestored" : "toastArchived",
                      () => {
                        if (!doc.archivedAt) router.push(`/admin/cms/${def.id}`);
                      },
                    )
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-pill border border-danger/40 text-sm font-semibold text-danger hover:bg-danger/5"
                >
                  {doc.archivedAt ? (
                    <ArchiveRestore className="size-4" aria-hidden />
                  ) : (
                    <Archive className="size-4" aria-hidden />
                  )}
                  {doc.archivedAt ? t("restore") : t("archive")}
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>

      {/* Publish bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          <p className="me-auto text-sm text-muted">
            {dirty ? t("unsaved") : view.hasDraft ? t("draftWaiting") : t("upToDate")}
          </p>

          {view.hasDraft && !dirty && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  async () => {
                    const result = await discardDraft(documentId, ctx, by);
                    if (result.data) commit(result.data);
                    return result;
                  },
                  "toastDiscarded",
                  markClean,
                )
              }
              className="inline-flex h-11 items-center gap-2 rounded-pill border border-line px-4 text-sm font-semibold text-body hover:bg-surface-muted"
            >
              <Trash2 className="size-4" aria-hidden />
              {t("discard")}
            </button>
          )}

          <Button variant="outline" disabled={busy || !dirty} onClick={() => void save(false)}>
            <Save className="size-4" aria-hidden />
            {t("saveDraft")}
          </Button>

          <Button
            disabled={busy || (!dirty && !view.hasDraft && !publishedNothing)}
            onClick={() =>
              dirty
                ? void save(true)
                : void run(
                    async () => {
                      const result = await publishDocument(documentId, ctx, by);
                      if (result.data?.mutation) commit(result.data.mutation);
                      return result;
                    },
                    "toastPublished",
                  )
            }
          >
            <Send className="size-4" aria-hidden />
            {t("publish")}
          </Button>
        </div>
      </div>
    </div>
  );
}
