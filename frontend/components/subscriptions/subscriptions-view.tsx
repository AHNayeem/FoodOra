"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { useSubscriptions } from "@/stores/subscriptions";
import { effectiveStatus } from "@/lib/subscriptions";
import { SubscriptionCard } from "./subscription-card";

/**
 * SubscriptionsView — `/account/subscriptions` (Phase C15). Reads the persisted
 * subscriptions store (the prototype's database of commitments), ordering live
 * plans above cancelled ones, and highlights the record the subscribe flow just
 * created via `?new=<id>`.
 */
export function SubscriptionsView() {
  const t = useTranslations("subscriptions");
  const params = useSearchParams();
  const newId = params.get("new");

  const subscriptions = useSubscriptions((s) => s.subscriptions);
  const hydrated = useSubscriptions((s) => s.hydrated);

  useEffect(() => {
    useSubscriptions.persist.rehydrate();
  }, []);

  const [now] = useState(() => new Date());

  const ordered = useMemo(() => {
    const rank = (status: string) => (status === "cancelled" ? 1 : 0);
    return [...subscriptions].sort(
      (a, b) =>
        rank(effectiveStatus(a, now)) - rank(effectiveStatus(b, now)) ||
        b.startedAt.localeCompare(a.startedAt),
    );
  }, [subscriptions, now]);

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line py-16 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <CalendarClock className="size-7" aria-hidden />
        </span>
        <h2 className="text-h3 text-ink">{t("accountEmpty")}</h2>
        <p className="max-w-sm text-body">{t("accountEmptyHint")}</p>
        <Link
          href="/meal-plans"
          className="mt-2 inline-flex h-11 items-center rounded-pill bg-primary px-6 font-semibold text-white hover:bg-primary-600"
        >
          {t("browsePlans")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted" aria-live="polite">
          {t("accountCount", { count: ordered.length })}
        </p>
        <Link
          href="/meal-plans"
          className="text-sm font-semibold text-primary hover:underline"
        >
          {t("browsePlans")}
        </Link>
      </div>

      {newId && subscriptions.some((s) => s.id === newId) && (
        <p className="flex items-center gap-2 rounded-panel border border-fresh/30 bg-fresh/10 px-4 py-3 text-sm font-medium text-fresh-600">
          <CheckCircle2 className="size-4.5 shrink-0" aria-hidden />
          {t("startedBanner")}
        </p>
      )}

      {ordered.map((subscription) => (
        <SubscriptionCard
          key={subscription.id}
          subscription={subscription}
          highlight={subscription.id === newId}
        />
      ))}
    </div>
  );
}
