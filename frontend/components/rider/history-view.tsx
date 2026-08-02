"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, Bike, Layers, Route } from "lucide-react";
import type { DeliveryJob } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { useRider } from "@/frontend/stores/rider";
import { getRiderJobs } from "@/frontend/services/delivery";
import { isBatch } from "@/frontend/lib/delivery";
import { toDateKey } from "@/frontend/lib/dates";
import { formatDistance, formatPrice } from "@/frontend/lib/format";
import { Badge } from "@/frontend/components/ui/badge";
import { useDateLabel } from "@/frontend/components/reservations/use-date-label";
import { useRiderApp } from "./rider-context";

/**
 * HistoryView — `/delivery/history` (Phase C18).
 *
 * A week of completed trips, grouped by day with the day's total, because that is
 * how a rider checks their own money: "Thursday said 1,900 — is Thursday 1,900?"
 * Each row carries what changes the answer — the batch, the distance, the cash.
 */
export function HistoryView() {
  const t = useTranslations("delivery");
  const { rider, zone } = useRiderApp();
  const currency = zone.currency as CurrencyCode;

  const completed = useRider((s) => s.completed);
  const declined = useRider((s) => s.declined);
  const remittances = useRider((s) => s.remittances);
  const withdrawals = useRider((s) => s.withdrawals);
  const hydrated = useRider((s) => s.hydrated);

  const [jobs, setJobs] = useState<DeliveryJob[] | null>(null);
  const [now] = useState(() => new Date());
  const dateLabel = useDateLabel(now);

  const ctx = useMemo(
    () => ({ completed, declined, remittances, withdrawals }),
    [completed, declined, remittances, withdrawals],
  );

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    getRiderJobs({ riderId: rider.id, now: Date.now(), ctx }).then((list) => {
      if (active) setJobs(list);
    });
    return () => {
      active = false;
    };
  }, [rider.id, ctx, hydrated]);

  // Group by the local day the money landed, newest day first.
  const days = useMemo(() => {
    const map = new Map<string, DeliveryJob[]>();
    for (const job of jobs ?? []) {
      const key = toDateKey(new Date(job.completedAt ?? job.offeredAt));
      map.set(key, [...(map.get(key) ?? []), job]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [jobs]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-h1 text-ink">{t("historyTitle")}</h1>
        <p className="text-sm text-muted">{t("historySubtitle")}</p>
      </div>

      {jobs === null ? (
        <div className="flex min-h-60 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
        </div>
      ) : days.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-8 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface-muted text-muted">
            <Bike className="size-6" aria-hidden />
          </span>
          <h2 className="mt-3 text-h3 text-ink">{t("historyEmptyTitle")}</h2>
          <p className="mt-1 text-sm text-body">{t("historyEmptyBody")}</p>
        </div>
      ) : (
        days.map(([date, dayJobs]) => {
          const total = dayJobs.reduce((sum, job) => sum + job.payout.total, 0);
          const distance = dayJobs.reduce((sum, job) => sum + job.distanceKm, 0);
          return (
            <section key={date}>
              <div className="mb-2 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-h3 text-ink">{dateLabel(date)}</h2>
                  <p className="text-xs text-muted">
                    {t("tripsCount", { count: dayJobs.length })} ·{" "}
                    {formatDistance(Math.round(distance * 10) / 10)}
                  </p>
                </div>
                <p className="text-base font-extrabold text-ink">
                  {formatPrice(total, currency)}
                </p>
              </div>

              <ul className="divide-y divide-line rounded-card border border-line bg-surface">
                {dayJobs.map((job) => (
                  <li key={job.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-fresh/10 text-fresh-600">
                      <Bike className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {job.orders.map((o) => o.vendorName).join(" + ")}
                      </p>
                      <p className="text-xs text-muted">
                        {new Date(job.completedAt ?? job.offeredAt).toLocaleTimeString(
                          undefined,
                          { hour: "2-digit", minute: "2-digit" },
                        )}{" "}
                        · {job.jobNumber}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          <Route className="size-3" aria-hidden />
                          {formatDistance(job.distanceKm)}
                        </span>
                        {isBatch(job) && (
                          <Badge tone="primary">
                            <Layers className="size-3" aria-hidden />
                            {t("batchOf", { count: job.orders.length })}
                          </Badge>
                        )}
                        {job.cashToCollect > 0 && (
                          <Badge tone="neutral">
                            <Banknote className="size-3" aria-hidden />
                            {formatPrice(job.cashToCollect, currency)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-ink">
                      {formatPrice(job.payout.total, currency)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
