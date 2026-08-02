"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronDown,
  MapPin,
  PauseCircle,
  PlayCircle,
  Undo2,
  X,
} from "lucide-react";
import type { PlannedDelivery, Subscription } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useSubscriptions } from "@/stores/subscriptions";
import { buildSchedule, deliveredCount, effectiveStatus } from "@/lib/subscriptions";
import { addDays, fromDateKey, toDateKey } from "@/lib/dates";
import {
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  skipDelivery,
  unskipDelivery,
} from "@/services/subscriptions";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/** How many upcoming deliveries the calendar shows before "see the rest". */
const VISIBLE_DELIVERIES = 4;

const STATE_TONE: Record<PlannedDelivery["state"], "neutral" | "primary" | "fresh" | "danger"> = {
  scheduled: "fresh",
  skipped: "danger",
  paused: "neutral",
  delivered: "neutral",
};

/**
 * SubscriptionCard — one live commitment on `/account/subscriptions`
 * (Phase C15). The delivery calendar under it is *derived* every render from
 * the subscription's rules and the current time, so a skip or a pause is
 * visible the moment the seam confirms it, with nothing to keep in sync.
 * All four mutations go through `services/subscriptions.ts`, which owns the
 * cutoff rules — this component never decides what is allowed on its own.
 */
export function SubscriptionCard({
  subscription,
  highlight,
}: {
  subscription: Subscription;
  highlight?: boolean;
}) {
  const t = useTranslations("subscriptions");
  const td = useTranslations("days");
  const locale = useLocale();
  const replace = useSubscriptions((s) => s.replace);
  const currency = subscription.plan.currency as CurrencyCode;

  const [now] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resumeOn, setResumeOn] = useState(() => toDateKey(addDays(now, 7)));

  const status = effectiveStatus(subscription, now);
  const schedule = useMemo(
    () =>
      buildSchedule(subscription, now, {
        count: 12,
        skipCutoffHours: subscription.plan.skipCutoffHours,
      }),
    [subscription, now],
  );
  const shown = expanded ? schedule : schedule.slice(0, VISIBLE_DELIVERIES);
  const delivered = useMemo(() => deliveredCount(subscription, now), [subscription, now]);

  const dateLabel = (key: string) =>
    fromDateKey(key).toLocaleDateString(locale, { day: "numeric", month: "short" });

  /** Run a service mutation, commit its record, surface its error key. */
  async function run(
    action: () => Promise<{ data: Subscription | null; error: string | null }>,
    successKey: string,
  ) {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (res.error || !res.data) {
      toast.error(t(res.error ?? "errors.generic"));
      return false;
    }
    replace(res.data);
    toast.success(t(successKey));
    return true;
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-panel border bg-surface",
        highlight ? "border-primary shadow-card" : "border-line",
      )}
    >
      {/* Head */}
      <div className="flex flex-wrap items-start gap-4 border-b border-line p-5">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-card">
          <Image
            src={subscription.plan.image}
            alt={subscription.plan.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/meal-plans/${subscription.plan.slug}`}
              className="font-extrabold text-ink hover:text-primary"
            >
              {subscription.plan.name}
            </Link>
            <Badge
              tone={
                status === "active" ? "fresh" : status === "paused" ? "accent" : "neutral"
              }
            >
              {t(`status.${status}`)}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {subscription.plan.vendorName} · {subscription.reference}
          </p>
          <p className="mt-1.5 text-sm text-body">
            {subscription.tierName} ·{" "}
            {t("mealsPerDay", { count: subscription.mealsPerDay })} ·{" "}
            {t("daysPerWeek", { count: subscription.deliveryDays.length })}
          </p>
        </div>

        <div className="text-end">
          <p className="text-lg font-extrabold text-ink">
            {formatPrice(subscription.pricing.total, currency)}
          </p>
          <p className="text-xs text-muted">{t(`totalPer.${subscription.cycle}`)}</p>
          {status !== "cancelled" && (
            <p className="mt-1 text-xs text-muted">
              {t("renewsOn", { date: dateLabel(subscription.renewsOn) })}
            </p>
          )}
        </div>
      </div>

      {/* Facts */}
      <dl className="grid gap-3 border-b border-line p-5 sm:grid-cols-3">
        <Fact label={t("factMeals")}>
          {subscription.slots.map((slot) => t(`slot.${slot}`)).join(" · ")}
        </Fact>
        <Fact label={t("factWindow")}>{subscription.deliveryWindow}</Fact>
        <Fact label={t("factDelivered")}>{t("deliveredCount", { count: delivered })}</Fact>
        <Fact label={t("factDays")}>
          {subscription.deliveryDays.map((day) => td(day)).join(", ")}
        </Fact>
        <Fact label={t("factAddress")} className="sm:col-span-2">
          <span className="inline-flex items-start gap-1.5">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
            <span>
              {subscription.address.line1}, {subscription.address.area},{" "}
              {subscription.address.city}
            </span>
          </span>
        </Fact>
        {subscription.notes && (
          <Fact label={t("factNotes")} className="sm:col-span-3">
            {subscription.notes}
          </Fact>
        )}
      </dl>

      {/* Calendar */}
      {status !== "cancelled" && (
        <div className="border-b border-line p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
            <CalendarClock className="size-4 text-primary" aria-hidden />
            {t("upcomingTitle")}
          </h3>
          {status === "paused" && subscription.pausedUntil && (
            <p className="mt-1.5 text-xs text-accent-600">
              {t("pausedUntil", { date: dateLabel(subscription.pausedUntil) })}
            </p>
          )}

          {shown.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("noUpcoming")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {shown.map((delivery) => (
                <li
                  key={delivery.date}
                  className="flex flex-wrap items-center gap-3 rounded-field bg-surface-muted px-3.5 py-2.5"
                >
                  <span className="text-sm font-semibold text-ink">
                    {td(delivery.day)} · {dateLabel(delivery.date)}
                  </span>
                  <Badge tone={STATE_TONE[delivery.state]}>
                    {t(`deliveryState.${delivery.state}`)}
                  </Badge>
                  <span className="ms-auto">
                    {delivery.canSkip && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => skipDelivery(subscription, delivery.date),
                            "skippedToast",
                          )
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-danger disabled:opacity-50"
                      >
                        <X className="size-3.5" aria-hidden />
                        {t("skipDay")}
                      </button>
                    )}
                    {delivery.state === "skipped" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => unskipDelivery(subscription, delivery.date),
                            "unskippedToast",
                          )
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:underline disabled:opacity-50"
                      >
                        <Undo2 className="size-3.5" aria-hidden />
                        {t("undoSkip")}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {schedule.length > VISIBLE_DELIVERIES && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <ChevronDown
                className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                aria-hidden
              />
              {expanded ? t("showLess") : t("showAll", { count: schedule.length })}
            </button>
          )}

          <p className="mt-3 text-xs text-muted">
            {t("cutoffNote", { hours: subscription.plan.skipCutoffHours })}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 p-5">
        {status === "active" && (
          <ActionButton icon={PauseCircle} onClick={() => setPauseOpen(true)} disabled={busy}>
            {t("pausePlan")}
          </ActionButton>
        )}
        {status === "paused" && (
          <ActionButton
            icon={PlayCircle}
            onClick={() => run(() => resumeSubscription(subscription), "resumedToast")}
            disabled={busy}
          >
            {t("resumePlan")}
          </ActionButton>
        )}
        {status !== "cancelled" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setCancelOpen(true)}
            className="ms-auto text-sm font-semibold text-danger hover:underline disabled:opacity-50"
          >
            {t("cancelPlan")}
          </button>
        )}
        {status === "cancelled" && (
          <p className="text-sm text-muted">{t("cancelledNote")}</p>
        )}
      </div>

      {/* Pause */}
      <Modal
        open={pauseOpen}
        onClose={() => setPauseOpen(false)}
        labelledBy={`pause-${subscription.id}`}
        className="w-full max-w-md p-6"
      >
        <h2 id={`pause-${subscription.id}`} className="text-h3 text-ink">
          {t("pauseTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">{t("pauseBody")}</p>
        <label className="mt-4 block text-sm font-medium text-ink" htmlFor={`resume-${subscription.id}`}>
          {t("resumeOn")}
        </label>
        <input
          id={`resume-${subscription.id}`}
          type="date"
          min={toDateKey(addDays(now, 1))}
          value={resumeOn}
          onChange={(e) => setResumeOn(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-field border border-line bg-surface px-3.5 text-sm text-ink outline-none focus:border-primary"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPauseOpen(false)}
            className="h-11 rounded-pill px-5 text-sm font-semibold text-body hover:bg-surface-muted"
          >
            {t("keepRunning")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const done = await run(
                () => pauseSubscription(subscription, resumeOn),
                "pausedToast",
              );
              if (done) setPauseOpen(false);
            }}
            className="h-11 rounded-pill bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
          >
            {t("confirmPause")}
          </button>
        </div>
      </Modal>

      {/* Cancel */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        labelledBy={`cancel-${subscription.id}`}
        className="w-full max-w-md p-6"
      >
        <h2 id={`cancel-${subscription.id}`} className="text-h3 text-ink">
          {t("cancelTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">
          {t("cancelBody", { date: dateLabel(subscription.renewsOn) })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setCancelOpen(false)}
            className="h-11 rounded-pill px-5 text-sm font-semibold text-body hover:bg-surface-muted"
          >
            {t("keepRunning")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const done = await run(
                () => cancelSubscription(subscription),
                "cancelledToast",
              );
              if (done) setCancelOpen(false);
            }}
            className="h-11 rounded-pill bg-danger px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {t("confirmCancel")}
          </button>
        </div>
      </Modal>
    </article>
  );
}

function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  onClick,
  disabled,
  children,
}: {
  icon: typeof PauseCircle;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 items-center gap-2 rounded-pill border border-line px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-50"
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </button>
  );
}
