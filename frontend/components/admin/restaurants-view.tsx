"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Inbox, Store, ShieldAlert, Clock } from "lucide-react";
import type { VendorApplication } from "@/types";
import { useOnboarding } from "@/stores/onboarding";
import { VENDOR_STATUSES } from "@/lib/onboarding";
import {
  EMPTY_APPLICATION_QUERY,
  countByStatus,
  filterApplications,
  vendorHaystack,
  type ApplicationQuery,
} from "@/lib/onboarding-search";
import { StatCard } from "@/components/dashboard/stat-card";
import { ApplicationFilters } from "@/components/onboarding/application-filters";
import { OnboardingStatusChip } from "@/components/onboarding/status-chip";
import { cn } from "@/lib/utils";

/**
 * AdminRestaurants — every restaurant on the platform (Phase 6, G12).
 *
 * The spec asks for search, filtering, a pending-applications view, details,
 * documents and the four decisions. This screen is the first five; the decisions
 * live on the detail route, because they need the paperwork on screen beside them.
 *
 * **The list and the applications queue are the same rows.** A platform that keeps
 * "restaurants" and "applications" as two screens has two records of one
 * restaurant, and the moment a reviewer approves from one screen the other is
 * stale. Here the pending queue is a filter — `awaitingOnly` — over the same set,
 * which is why the counts on the chips and the count on the nav badge cannot
 * disagree.
 *
 * Ordering is `filterApplications`': pending first and oldest-first within it,
 * because that half is work; everything decided after it, newest first, because
 * that half is history.
 */
export function AdminRestaurants() {
  const t = useTranslations("onboarding");
  const format = useFormatter();

  const hydrated = useOnboarding((s) => s.hydrated);
  const applications = useOnboarding((s) => s.vendorApplications);

  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState<ApplicationQuery>({
    ...EMPTY_APPLICATION_QUERY,
    // Opens on the work rather than on 24 approved restaurants: the reason to
    // visit this screen is almost always an application waiting for an answer.
    awaitingOnly: true,
  });

  useEffect(() => {
    useOnboarding.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(
    () => filterApplications(applications, query, now, vendorHaystack),
    [applications, query, now],
  );

  const counts = useMemo(
    () => countByStatus(applications, query, now, vendorHaystack, VENDOR_STATUSES),
    [applications, query, now],
  );

  const stats = useMemo(() => {
    const live = applications.filter((a) => !a.deletedAt);
    const pending = live.filter((a) => a.status === "pending");
    return {
      approved: live.filter((a) => a.status === "approved").length,
      pending: pending.length,
      suspended: live.filter((a) => a.status === "suspended").length,
      // The longest an application has waited, in whole days — the number that
      // says whether the queue is healthy rather than how long it is.
      oldestDays: pending.length
        ? Math.max(
            ...pending.map((a) =>
              Math.floor((now - Date.parse(a.submittedAt ?? a.createdAt)) / 86_400_000),
            ),
          )
        : 0,
    };
  }, [applications, now]);

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-card bg-surface" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h2 text-ink">{t("restaurantsTitle")}</h1>
        <p className="text-sm text-muted">{t("restaurantsSubtitle")}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("statLive")}
          value={String(stats.approved)}
          icon={Store}
          hint={t("statLiveHint")}
        />
        <StatCard
          label={t("statPending")}
          value={String(stats.pending)}
          icon={Clock}
          hint={
            stats.pending
              ? t("statPendingHint", { days: stats.oldestDays })
              : t("statPendingNone")
          }
        />
        <StatCard
          label={t("statSuspended")}
          value={String(stats.suspended)}
          icon={ShieldAlert}
          hint={t("statSuspendedHint")}
        />
      </div>

      <ApplicationFilters
        query={query}
        onChange={setQuery}
        statuses={VENDOR_STATUSES}
        counts={counts}
        awaitingCount={stats.pending}
        searchPlaceholder={t("restaurantsSearchPlaceholder")}
        searchLabel={t("restaurantsSearchLabel")}
      />

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
            <Inbox className="size-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink">{t("queueEmpty")}</p>
          <p className="max-w-sm text-xs text-muted">{t("queueEmptyHint")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {visible.map((application) => (
            <Row
              key={application.id}
              application={application}
              now={now}
              format={format}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  application,
  now,
  format,
}: {
  application: VendorApplication;
  now: number;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations("onboarding");
  const waiting = application.status === "pending";

  return (
    <li>
      <Link
        href={`/admin/restaurants/${application.id}`}
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 p-3.5 transition-colors hover:bg-surface-muted",
          waiting && "bg-accent-50/40",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-ink">
              {application.restaurant.name}
            </span>
            <OnboardingStatusChip status={application.status} />
            <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-body">
              {t(`vendorType.${application.business.vendorType}`)}
            </span>
            {/* A brand-new application has no listing yet; saying so on the row
                tells a reviewer that approving it will create one. */}
            {!application.vendorId && (
              <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {t("newListing")}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <span className="font-mono">{application.applicationNumber}</span>
            <span aria-hidden>·</span>
            {application.owner.name}
            <span aria-hidden>·</span>
            {application.restaurant.location.address}
          </span>
        </span>
        <span className="text-end text-xs text-muted">
          {application.submittedAt
            ? t("submittedAgo", {
                ago: format.relativeTime(new Date(application.submittedAt), now),
              })
            : t("draftSaved", {
                ago: format.relativeTime(new Date(application.updatedAt), now),
              })}
        </span>
      </Link>
    </li>
  );
}
