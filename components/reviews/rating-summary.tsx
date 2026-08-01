"use client";

import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, Camera } from "lucide-react";
import type { ReviewSummary, StarValue } from "@/types";
import { REVIEW_ASPECTS, STAR_VALUES } from "@/lib/reviews";
import { formatRating } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Stars } from "./stars";

/**
 * RatingSummary — the block above a review list (Phase C22): the headline score,
 * the histogram, the aspect averages and what people keep saying.
 *
 * Every number here comes from `services/reviews`, which derived it in one pass
 * through `lib/reviews.summariseVendor` — the component does no aggregation of
 * its own, so the storefront and the merchant's dashboard cannot print different
 * versions of the same restaurant.
 *
 * The histogram bars are also the star filter: reading "most of the complaints
 * are two-star" and then wanting to read those two-star reviews is one thought,
 * so it should be one click.
 */
export function RatingSummary({
  summary,
  activeStar = null,
  onSelectStar,
  className,
}: {
  summary: ReviewSummary;
  activeStar?: StarValue | null;
  /** Omit to render the histogram read-only (the merchant's overview). */
  onSelectStar?: (star: StarValue | null) => void;
  className?: string;
}) {
  const t = useTranslations("reviews");
  const locale = useLocale();
  const total = summary.count;
  const nf = new Intl.NumberFormat(locale);
  const aspects = REVIEW_ASPECTS.filter((aspect) => summary.aspects[aspect] > 0);

  return (
    <div className={cn("grid gap-6 md:grid-cols-[minmax(0,220px)_1fr]", className)}>
      {/* Headline */}
      <div className="flex flex-col items-center justify-center gap-1 rounded-panel border border-line bg-surface-alt p-5 text-center">
        <p className="text-5xl font-extrabold leading-none text-ink">
          {formatRating(summary.average)}
        </p>
        <Stars value={summary.average} size="md" label={t("outOfFive", { rating: formatRating(summary.average) })} />
        <p className="text-sm text-muted">{t("basedOn", { count: total })}</p>
        {summary.recommend > 0 && (
          <p className="mt-2 text-sm font-semibold text-fresh-600">
            {t("recommend", { percent: Math.round(summary.recommend * 100) })}
          </p>
        )}
      </div>

      <div className="space-y-4">
        {/* Histogram */}
        <ul className="space-y-1.5">
          {STAR_VALUES.map((star) => {
            const count = summary.distribution[star];
            const share = total === 0 ? 0 : (count / total) * 100;
            const active = activeStar === star;
            const row = (
              <>
                <span className="w-10 shrink-0 text-sm tabular-nums text-body">
                  {t("starsShort", { count: star })}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-muted">
                  <span
                    className={cn(
                      "block h-full rounded-pill transition-[width]",
                      active ? "bg-primary" : "bg-rating",
                    )}
                    style={{ width: `${share}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 text-end text-xs tabular-nums text-muted">
                  {nf.format(count)}
                </span>
              </>
            );

            return (
              <li key={star}>
                {onSelectStar ? (
                  <button
                    type="button"
                    onClick={() => onSelectStar(active ? null : star)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-field px-1.5 py-1 transition-colors",
                      "hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary",
                      active && "bg-primary/5",
                    )}
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex w-full items-center gap-3 px-1.5 py-1">{row}</div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Aspect averages — only the ones people actually scored */}
        {aspects.length > 0 && (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {aspects.map((aspect) => (
              <div
                key={aspect}
                className="rounded-card border border-line bg-surface px-3 py-2"
              >
                <dt className="text-xs text-muted">{t(`aspect.${aspect}`)}</dt>
                <dd className="flex items-center gap-1.5 font-semibold text-ink">
                  {formatRating(summary.aspects[aspect])}
                  <Stars value={summary.aspects[aspect]} size="sm" />
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* What people keep saying */}
        {summary.topTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{t("peopleSay")}</span>
            {summary.topTags.map(({ tag, count }) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-sm text-body"
              >
                {t(`tag.${tag}`)}
                <span className="text-xs text-muted">{count}</span>
              </span>
            ))}
          </div>
        )}

        {/* Corpus facts — deliberately about the reviews on hand, not the table */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {summary.verified > 0 && (
            <span className="inline-flex items-center gap-1">
              <BadgeCheck className="size-3.5 text-fresh-600" aria-hidden />
              {t("verifiedCount", { count: summary.verified })}
            </span>
          )}
          {summary.withMedia > 0 && (
            <span className="inline-flex items-center gap-1">
              <Camera className="size-3.5" aria-hidden />
              {t("withPhotosCount", { count: summary.withMedia })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
