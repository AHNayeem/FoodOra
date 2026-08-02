"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { BadgeCheck, Flag, MessageSquareQuote, Pencil, ThumbsUp } from "lucide-react";
import type { Review } from "@/frontend/types";
import { wasEdited } from "@/frontend/lib/reviews";
import { cn } from "@/frontend/lib/utils";
import { Stars } from "./stars";
import { ReviewMediaStrip } from "./review-media";
import { useTimeAgo } from "./use-time-ago";

/**
 * ReviewCard — one review, wherever it is read (Phase C22).
 *
 * The storefront, the customer's own list, the merchant's board and the rider's
 * profile all render this: a review looks the same to everyone, and only the
 * *actions* around it differ, which is why they arrive as a slot rather than as
 * four variants of the card. That is the same shape `CouponTicket` (C21) took,
 * for the same reason.
 *
 * The merchant's reply is nested inside the card rather than listed beside it —
 * an answer is only meaningful attached to its question.
 */
export function ReviewCard({
  review,
  nowMs,
  voted = false,
  onHelpful,
  onReport,
  reported = false,
  actions,
  className,
}: {
  review: Review;
  /** The instant the seam read the corpus at — all dates are relative to it. */
  nowMs: number;
  voted?: boolean;
  /** Omit to hide the helpful control (the author's own list, the merchant's board). */
  onHelpful?: () => void;
  onReport?: () => void;
  reported?: boolean;
  /** Edit/delete for an author, reply for a merchant. */
  actions?: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("reviews");
  const timeAgo = useTimeAgo(nowMs);

  return (
    <article
      className={cn("rounded-panel border border-line bg-surface p-5", className)}
    >
      <div className="flex items-start gap-3">
        <Avatar name={review.authorName} src={review.authorAvatar} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink">{review.authorName}</span>
            {review.verified && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-fresh-600">
                <BadgeCheck className="size-4" aria-hidden />
                {t("verified")}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Stars
              value={review.rating}
              size="sm"
              label={t("outOfFive", { rating: review.rating })}
            />
            <span className="text-xs text-muted">{timeAgo(review.createdAt)}</span>
            {wasEdited(review) && (
              <span className="text-xs text-muted">· {t("edited")}</span>
            )}
          </div>
        </div>

        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>

      {review.comment && (
        <p className="mt-3 whitespace-pre-line text-body">{review.comment}</p>
      )}

      <ReviewMediaStrip media={review.media} authorName={review.authorName} />

      {review.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {review.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-medium text-body"
            >
              {t(`tag.${tag}`)}
            </li>
          ))}
        </ul>
      )}

      {/* The restaurant's public answer */}
      {review.reply && (
        <div className="mt-4 rounded-card border border-line bg-surface-alt p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <MessageSquareQuote className="size-4 text-primary" aria-hidden />
            {t("replyFrom", { vendor: review.reply.authorName })}
            <span className="font-normal text-muted">{timeAgo(review.reply.repliedAt)}</span>
          </p>
          <p className="mt-1.5 whitespace-pre-line text-sm text-body">{review.reply.body}</p>
        </div>
      )}

      {(onHelpful || onReport) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {onHelpful && (
            <button
              type="button"
              onClick={onHelpful}
              aria-pressed={voted}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold transition-colors",
                voted
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-line text-body hover:bg-surface-muted",
              )}
            >
              <ThumbsUp className={cn("size-3.5", voted && "fill-current")} aria-hidden />
              {t("helpful", { count: review.helpfulCount })}
            </button>
          )}
          {onReport && (
            <button
              type="button"
              onClick={onReport}
              disabled={reported}
              className="inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Flag className="size-3.5" aria-hidden />
              {reported ? t("reported") : t("report")}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** Photo where there is one, initials where there is not. */
function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={44}
        height={44}
        className="size-11 shrink-0 rounded-pill object-cover"
      />
    );
  }
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-primary/10 font-bold text-primary"
    >
      {initials}
    </span>
  );
}

/** The pencil affordance an author gets on their own review. */
export function EditReviewButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex size-9 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-ink"
    >
      <Pencil className="size-4" aria-hidden />
    </button>
  );
}
