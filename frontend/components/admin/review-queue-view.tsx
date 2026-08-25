"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { EyeOff, Flag, Inbox, MessageSquareWarning, Search, ShieldCheck, Trash2, X } from "lucide-react";
import type { ReviewModerationStatus, ReviewQueueRow, ReviewQueueSort } from "@/types";
import type { ModerationQueue } from "@/services/reviews";
import { getModerationQueue } from "@/services/reviews";
import { useOrders } from "@/stores/orders";
import { useReviewContext, useReviews } from "@/stores/reviews";
import { useReviewModeration } from "@/stores/review-moderation";
import {
  EMPTY_QUEUE_QUERY,
  REVIEW_QUEUE_SEGMENTS,
  REVIEW_QUEUE_SORTS,
  isEmptyQueueQuery,
  type ReviewQueueQuery,
} from "@/lib/review-moderation";
import { Stars } from "@/components/reviews/stars";
import { StatCard } from "@/components/dashboard/stat-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Rows rendered before "show more". */
const PAGE = 20;

/** Tone per decision. Hidden and removed are both off the storefront, and differ. */
export const MODERATION_TONE: Record<ReviewModerationStatus, string> = {
  pending: "bg-accent-50 text-accent-600",
  approved: "bg-fresh-50 text-fresh-600",
  hidden: "bg-surface-muted text-ink",
  removed: "bg-danger/10 text-danger",
};

/**
 * AdminReviewQueue — reported reviews and what the platform did about them
 * (Phase 13, G29).
 *
 * Before this the prototype could *raise* a report and nothing could read one:
 * `services/reviews.reportReview` said so in its own comment ("the report goes
 * nowhere in a prototype"), which meant the flag on every review card was a
 * button that thanked you and dropped the objection on the floor. A restaurant
 * being libelled had no recourse and a moderator had no queue.
 *
 * The queue is **derived from the decisions, not from the reviews**. A review with
 * no moderation record has never been reported and is not here; the rows are the
 * records in `stores/review-moderation`, each joined back to the review it names,
 * the restaurant it is about, the order behind it and the person who wrote it.
 * Everything on this screen therefore describes something somebody actually
 * objected to.
 *
 * It opens on `pending`, sorted by how many people objected — the two questions a
 * moderation desk actually starts from.
 */
export function AdminReviewQueue() {
  const t = useTranslations("moderation");
  const format = useFormatter();

  const ctx = useReviewContext();
  const orders = useOrders((s) => s.orders);
  const ordersHydrated = useOrders((s) => s.hydrated);
  const moderationHydrated = useReviewModeration((s) => s.hydrated);

  const [queue, setQueue] = useState<ModerationQueue | null>(null);
  const [query, setQuery] = useState<ReviewQueueQuery>(EMPTY_QUEUE_QUERY);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    useOrders.persist.rehydrate();
    useReviews.persist.rehydrate();
    void useReviewModeration.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!ordersHydrated || !moderationHydrated) return;
    let live = true;
    getModerationQueue(ctx, orders, query).then((next) => {
      if (live) setQueue(next);
    });
    return () => {
      live = false;
    };
  }, [ctx, orders, ordersHydrated, moderationHydrated, query]);

  function patch(next: Partial<ReviewQueueQuery>) {
    setQuery((q) => ({ ...q, ...next }));
    setLimit(PAGE);
  }

  const visible = useMemo(() => queue?.rows.slice(0, limit) ?? [], [queue, limit]);

  if (!queue) {
    return (
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-card bg-surface" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-card bg-surface" />
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
        <p className="text-sm font-semibold text-muted tabular-nums">
          {t("count", { count: queue.rows.length })}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("statPending")}
          value={String(queue.totals.pending)}
          icon={MessageSquareWarning}
          hint={t("statPendingHint", { count: queue.totals.reported })}
        />
        <StatCard
          label={t("statReports")}
          value={String(queue.totals.reports)}
          icon={Flag}
          hint={t("statReportsHint", { count: queue.totals.vendors })}
        />
        <StatCard
          label={t("statHidden")}
          value={String(queue.totals.hidden)}
          icon={EyeOff}
          hint={t("statHiddenHint")}
        />
        <StatCard
          label={t("statRemoved")}
          value={String(queue.totals.removed)}
          icon={Trash2}
          hint={t("statRemovedHint")}
        />
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          value={query.text}
          onChange={(e) => patch({ text: e.target.value })}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="ps-10"
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {REVIEW_QUEUE_SEGMENTS.map((segment) => (
            <button
              key={segment}
              type="button"
              aria-pressed={query.segment === segment}
              onClick={() => patch({ segment })}
              className={cn(
                "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors",
                query.segment === segment
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-line text-body hover:bg-surface-muted",
              )}
            >
              {t(`segment.${segment}`)}
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-pill px-1.5 text-xs font-bold tabular-nums",
                  query.segment === segment
                    ? "bg-primary/15 text-primary"
                    : "bg-surface-muted text-muted",
                )}
              >
                {queue.counts[segment]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            aria-pressed={query.criticalOnly}
            onClick={() => patch({ criticalOnly: !query.criticalOnly })}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-pill border px-3 text-sm font-semibold transition-colors",
              query.criticalOnly
                ? "border-danger bg-danger/5 text-danger"
                : "border-line text-body hover:bg-surface-muted",
            )}
          >
            {t("criticalOnly")}
          </button>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
              {t("sortLabel")}
            </span>
            <select
              value={query.sort}
              onChange={(e) => patch({ sort: e.target.value as ReviewQueueSort })}
              className="h-11 rounded-field border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus-visible:border-primary"
            >
              {REVIEW_QUEUE_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {t(`sort.${sort}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!isEmptyQueueQuery(query) && (
        <button
          type="button"
          onClick={() => {
            setQuery(EMPTY_QUEUE_QUERY);
            setLimit(PAGE);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <X className="size-3.5" aria-hidden />
          {t("clear")}
        </button>
      )}

      {queue.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
            {query.segment === "pending" ? (
              <ShieldCheck className="size-6" aria-hidden />
            ) : (
              <Inbox className="size-6" aria-hidden />
            )}
          </span>
          <p className="text-sm font-semibold text-ink">
            {query.segment === "pending" && isEmptyQueueQuery({ ...query, segment: "pending" })
              ? t("emptyPending")
              : t("empty")}
          </p>
          <p className="max-w-sm text-xs text-muted">{t("emptyHint")}</p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {visible.map((row) => (
              <QueueRow key={row.review.id} row={row} nowMs={queue.nowMs} format={format} />
            ))}
          </ul>
          {queue.rows.length > visible.length && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted tabular-nums">
                {t("showing", { shown: visible.length, total: queue.rows.length })}
              </p>
              <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                {t("more")}
              </Button>
            </div>
          )}
        </>
      )}

      {queue.unresolved > 0 && (
        <p className="text-xs text-muted">{t("unresolved", { count: queue.unresolved })}</p>
      )}
    </div>
  );
}

/**
 * One reported review in the list.
 *
 * The five facts a moderator triages on: how bad the review is, what it says, who
 * objected and on what grounds, which restaurant carries it, and whether anybody
 * has decided yet. The evidence — the order, the author's history, the whole
 * report thread — is one tap away rather than crammed in.
 */
function QueueRow({
  row,
  nowMs,
  format,
}: {
  row: ReviewQueueRow;
  nowMs: number;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations("moderation");
  // The report vocabulary lives in the `reviews` namespace because both ends of
  // it — the customer's report dialog and this queue — must name the grounds the
  // same way (Phase 13).
  const tr = useTranslations("reviews");
  const { review, record, vendor } = row;
  const reasons = [...new Set(record.reports.map((r) => r.reason))];

  return (
    <li className="rounded-card border border-line bg-surface">
      <Link
        href={`/admin/reviews/${review.id}`}
        className="block p-4 transition-colors hover:bg-surface-muted"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Stars value={review.rating} size="sm" label={t("stars", { rating: review.rating })} />
          <span className="text-sm font-bold text-ink">{review.authorName}</span>
          {vendor && <span className="text-xs text-muted">· {vendor.name}</span>}
          <span
            className={cn(
              "ms-auto inline-flex rounded-pill px-2.5 py-1 text-xs font-semibold",
              MODERATION_TONE[record.status],
            )}
          >
            {t(`status.${record.status}`)}
          </span>
        </div>

        {review.comment && (
          <p className="mt-2 line-clamp-2 text-sm text-body">{review.comment}</p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-pill bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
            <Flag className="size-3" aria-hidden />
            {t("reportCount", { count: record.reports.length })}
          </span>
          {reasons.map((reason) => (
            <span
              key={reason}
              className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-body"
            >
              {tr(`reportReason.${reason}`)}
            </span>
          ))}
          <span className="text-[11px] text-muted">
            {t("reportedAgo", {
              ago: format.relativeTime(
                new Date(record.reports.at(-1)?.at ?? record.createdAt),
                nowMs,
              ),
            })}
          </span>
        </div>
      </Link>
    </li>
  );
}
