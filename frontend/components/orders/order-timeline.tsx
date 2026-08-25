"use client";

import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Check } from "lucide-react";
import type { Order } from "@/types";
import { trackingProgress, type TrackStep } from "@/lib/tracking";
import { isFailure } from "@/lib/order-machine";
import { cn } from "@/lib/utils";
import { ACTOR_KEY, STATUS_ICON, STATUS_TONE, TONE_SOLID } from "./order-status-meta";

/**
 * OrderTimeline — the shared lifecycle timeline (spec: Order Timeline
 * Component).
 *
 * One component, four surfaces: the customer's tracker, the restaurant's order
 * detail, the rider's trip sheet and the admin's live view all render this, so
 * an order's history reads identically wherever it is opened.
 *
 * What it draws is the *event log*, not a guess. A completed step shows when it
 * happened and who did it; a step that has not happened yet has no time, because
 * nobody knows. If the order ended badly the interruption is drawn where it
 * occurred and the remaining steps are struck through — a cancelled order should
 * not look like it is still on its way.
 *
 * The current step animates (a slow pulse ring, motion-safe), which is the only
 * moving thing on the page and therefore where the eye goes.
 */
export function OrderTimeline({
  order,
  now,
  compact = false,
  className,
}: {
  order: Order;
  /** Wall clock, passed in so the parent owns the tick. */
  now: number;
  /** Denser layout for side panels and list rows. */
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("order");
  const locale = useLocale();
  const progress = trackingProgress(order, now);

  const time = (ms: number) =>
    new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  // Where the journey was interrupted, so the steps after it can be greyed out.
  const failureEvent = progress.failed
    ? order.lifecycle.events.filter((e) => isFailure(e.status)).at(-1) ?? null
    : null;
  const brokeAt = progress.steps.filter((s) => s.done).length;

  return (
    <ol className={cn("relative", className)}>
      {progress.steps.map((step, i) => {
        const isLast = i === progress.steps.length - 1 && !failureEvent;
        const abandoned = !!failureEvent && i >= brokeAt;
        return (
          <TimelineRow
            key={step.status}
            step={step}
            isLast={isLast}
            abandoned={abandoned}
            compact={compact}
            label={t(`status.${step.status}`)}
            actorLabel={step.actor ? t(`actor.${ACTOR_KEY[step.actor]}`) : null}
            noteLabel={detailLabel(step, t)}
            timeLabel={step.at ? time(step.at) : null}
            nowLabel={t("now")}
          />
        );
      })}

      {/* The interruption, drawn at the point it happened. */}
      {failureEvent && (
        <li className="relative flex gap-3 pb-0">
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-pill bg-danger text-white">
            <AlertTriangle className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-danger">
                {t(`status.${failureEvent.status}`)}
              </span>
              <span className="block text-xs text-muted">
                {reasonText(order, t)}
              </span>
            </span>
            <time className="shrink-0 text-xs text-muted">
              {time(Date.parse(failureEvent.at))}
            </time>
          </div>
        </li>
      )}
    </ol>
  );
}

/** One row. Split out so the map above stays readable. */
function TimelineRow({
  step,
  isLast,
  abandoned,
  compact,
  label,
  actorLabel,
  noteLabel,
  timeLabel,
  nowLabel,
}: {
  step: TrackStep;
  isLast: boolean;
  abandoned: boolean;
  compact: boolean;
  label: string;
  actorLabel: string | null;
  noteLabel: string | null;
  timeLabel: string | null;
  nowLabel: string;
}) {
  const Icon = STATUS_ICON[step.status];
  const tone = STATUS_TONE[step.status];

  return (
    <li className={cn("relative flex gap-3", compact ? "pb-4" : "pb-6", isLast && "pb-0")}>
      {!isLast && (
        <span
          aria-hidden
          className={cn(
            "absolute top-8 left-[15px] w-0.5",
            compact ? "h-[calc(100%-1.5rem)]" : "h-[calc(100%-1.5rem)]",
            step.done && !abandoned ? "bg-primary" : "bg-line",
          )}
        />
      )}

      <span
        className={cn(
          "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-pill border-2 transition-colors",
          step.done && !abandoned
            ? cn("border-transparent", TONE_SOLID[tone])
            : "border-line bg-surface text-muted",
          abandoned && "opacity-40",
        )}
      >
        {step.done && !step.active ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Icon className="size-4" aria-hidden />
        )}
        {step.active && (
          <span
            aria-hidden
            className="absolute inset-[-6px] rounded-pill border-2 border-primary/40 motion-safe:animate-ping"
          />
        )}
      </span>

      <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1">
        <span className="min-w-0">
          <span
            className={cn(
              "block text-sm font-semibold",
              step.done && !abandoned ? "text-ink" : "text-muted",
              abandoned && "line-through opacity-60",
            )}
          >
            {label}
            {step.active && (
              <span className="ms-2 rounded-pill bg-primary/10 px-2 py-0.5 align-middle text-[11px] font-medium text-primary">
                {nowLabel}
              </span>
            )}
          </span>
          {(noteLabel || (actorLabel && step.done)) && (
            <span className="block truncate text-xs text-muted">
              {noteLabel ?? actorLabel}
            </span>
          )}
        </span>
        {timeLabel && (
          <time className="shrink-0 text-xs tabular-nums text-muted">{timeLabel}</time>
        )}
      </div>
    </li>
  );
}

/**
 * Events carry typed payloads rather than prose, so they can be localised at
 * render time. This is where they become sentences.
 *
 * It used to switch on `note.split(":")` and fall through to the raw code for
 * anything it had no case for — which is how `handover-failed:3` and `rating:4`
 * came to be shown to customers verbatim. The switch is now over
 * `OrderEventDetail["kind"]`, so the compiler names the missing case instead of
 * the timeline printing it (Phase 18, G45).
 *
 * The one member that renders as itself is `note`, which *is* prose: somebody
 * typed it, and there is nothing to translate.
 */
function detailLabel(
  step: TrackStep,
  t: ReturnType<typeof useTranslations>,
): string | null {
  const detail = step.detail;
  if (!detail) return null;
  switch (detail.kind) {
    case "delay":
      return t("note.delay", { minutes: detail.minutes });
    case "otp-failed":
      return t("note.otpFailed", { count: detail.attempts });
    case "handover-failed":
      return t("note.handoverFailed", { count: detail.attempts });
    case "refund-requested":
      return t("note.refundRequested");
    case "refund-approved":
      return t("note.refundApproved");
    case "refund-rejected":
      return t("note.refundRejected");
    case "refund-settled":
      return t("note.refundSettled");
    case "reassigned":
      return detail.fromRider
        ? t("note.reassignedFrom", { name: detail.fromRider })
        : t("note.reassigned");
    case "scheduled-release":
      return t("note.scheduledRelease");
    case "rating":
      return t("note.rating", { score: detail.score });
    case "note":
      return detail.body;
  }
}

/** The human reason an order ended early, from whichever field holds it. */
function reasonText(order: Order, t: ReturnType<typeof useTranslations>): string {
  const { rejectionReason, cancelReason, failureReason, cancelledBy } = order.lifecycle;
  const reason = rejectionReason ?? cancelReason ?? failureReason;
  const label = reason ? t(`reason.${reason}`) : t("reason.other");
  if (cancelledBy) return `${t(`actor.${ACTOR_KEY[cancelledBy]}`)} · ${label}`;
  return label;
}
