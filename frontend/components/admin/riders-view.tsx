"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Bike, Clock, Inbox, ShieldAlert } from "lucide-react";
import type { RiderApplication } from "@/types";
import { offShiftRiderIds, useFleet } from "@/stores/fleet";
import { useOnboarding } from "@/stores/onboarding";
import { busyRiderIds, useOrders } from "@/stores/orders";
import { RIDER_STATUSES } from "@/lib/onboarding";
import { canDispatchToRider } from "@/lib/rider-onboarding";
import {
  EMPTY_APPLICATION_QUERY,
  countByStatus,
  filterApplications,
  riderHaystack,
  type ApplicationQuery,
} from "@/lib/onboarding-search";
import { StatCard } from "@/components/dashboard/stat-card";
import { ApplicationFilters } from "@/components/onboarding/application-filters";
import { OnboardingStatusChip } from "@/components/onboarding/status-chip";
import { cn } from "@/lib/utils";

/**
 * AdminRiders — the fleet and its applications (Phase 7, G13).
 *
 * Same construction as `/admin/restaurants` and for the same reason: the rider list
 * and the applications queue are one set of rows filtered differently, so an
 * approval cannot leave one of them stale.
 *
 * The one thing this list has that the restaurant list does not is **availability**.
 * The spec asks for it, and it is three separate facts that were previously
 * scattered: onboarding says whether a rider may work at all, the shift board says
 * whether they are on, and the order store says whether they are carrying something.
 * All three are read here from the stores that own them — nothing is mirrored.
 */
export function AdminRiders() {
  const t = useTranslations("onboarding");
  const format = useFormatter();

  const hydrated = useOnboarding((s) => s.hydrated);
  const applications = useOnboarding((s) => s.riderApplications);
  const shifts = useFleet((s) => s.shifts);
  const orders = useOrders((s) => s.orders);

  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState<ApplicationQuery>({
    ...EMPTY_APPLICATION_QUERY,
    awaitingOnly: true,
  });

  useEffect(() => {
    useOnboarding.persist.rehydrate();
    useFleet.persist.rehydrate();
    useOrders.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(
    () => filterApplications(applications, query, now, riderHaystack),
    [applications, query, now],
  );

  const counts = useMemo(
    () => countByStatus(applications, query, now, riderHaystack, RIDER_STATUSES),
    [applications, query, now],
  );

  const offShift = useMemo(() => offShiftRiderIds(shifts), [shifts]);
  const busy = useMemo(() => busyRiderIds(orders), [orders]);

  const stats = useMemo(() => {
    const live = applications.filter((a) => !a.deletedAt);
    const pending = live.filter((a) => a.status === "pending");
    const working = live.filter((a) => canDispatchToRider(a.status));
    return {
      working: working.length,
      // "Available" is the intersection of all three facts, which is the number a
      // dispatcher actually cares about — a fleet of 40 with nobody free is not 40.
      available: working.filter(
        (a) => a.riderId && !offShift.has(a.riderId) && !busy.has(a.riderId),
      ).length,
      pending: pending.length,
      blocked: live.filter((a) => a.status === "suspended" || a.status === "inactive")
        .length,
    };
  }, [applications, offShift, busy]);

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
        <h1 className="text-h2 text-ink">{t("ridersTitle")}</h1>
        <p className="text-sm text-muted">{t("ridersSubtitle")}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("statFleet")}
          value={`${stats.available}/${stats.working}`}
          icon={Bike}
          hint={t("statFleetHint")}
        />
        <StatCard
          label={t("statPending")}
          value={String(stats.pending)}
          icon={Clock}
          hint={stats.pending ? t("statPendingRiders") : t("statPendingNone")}
        />
        <StatCard
          label={t("statBlocked")}
          value={String(stats.blocked)}
          icon={ShieldAlert}
          hint={t("statBlockedHint")}
        />
      </div>

      <ApplicationFilters
        query={query}
        onChange={setQuery}
        statuses={RIDER_STATUSES}
        counts={counts}
        awaitingCount={stats.pending}
        searchPlaceholder={t("ridersSearchPlaceholder")}
        searchLabel={t("ridersSearchLabel")}
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
              availability={availabilityOf(application, offShift, busy)}
              now={now}
              format={format}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** The four availability labels, in the order they override each other. */
type Availability = "blocked" | "carrying" | "offShift" | "free";

function availabilityOf(
  application: RiderApplication,
  offShift: ReadonlySet<string>,
  busy: ReadonlySet<string>,
): Availability {
  if (!application.riderId || !canDispatchToRider(application.status)) return "blocked";
  if (busy.has(application.riderId)) return "carrying";
  if (offShift.has(application.riderId)) return "offShift";
  return "free";
}

const AVAILABILITY_DOT: Record<Availability, string> = {
  blocked: "bg-danger",
  carrying: "bg-accent",
  offShift: "bg-line",
  free: "bg-fresh",
};

function Row({
  application,
  availability,
  now,
  format,
}: {
  application: RiderApplication;
  availability: Availability;
  now: number;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations("onboarding");
  const td = useTranslations("dashboard");
  const waiting = application.status === "pending";

  return (
    <li>
      <Link
        href={`/admin/riders/${application.id}`}
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 p-3.5 transition-colors hover:bg-surface-muted",
          waiting && "bg-accent-50/40",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-ink">
              {application.personal.name}
            </span>
            <OnboardingStatusChip status={application.status} />
            <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-body">
              {td(`vehicle.${application.vehicleInfo.vehicle}`)}
            </span>
            {!application.riderId && (
              <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {t("newRider")}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <span className="font-mono">{application.applicationNumber}</span>
            <span aria-hidden>·</span>
            {application.contact.phone}
            <span aria-hidden>·</span>
            {application.personal.area}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          <span
            className={cn("size-2 rounded-full", AVAILABILITY_DOT[availability])}
            aria-hidden
          />
          <span className="font-semibold text-muted">
            {t(`availability.${availability}`)}
          </span>
        </span>
        <span className="w-full text-end text-xs text-muted sm:w-auto">
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
