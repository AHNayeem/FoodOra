"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  Check,
  PackageX,
  Pause,
  Play,
  X,
} from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import { useAuth } from "@/stores/auth";
import { useOnboarding } from "@/stores/onboarding";
import { completedOrdersForRider, useOrders } from "@/stores/orders";
import { offShiftRiderIds, useFleet } from "@/stores/fleet";
import {
  RIDER_TRANSITIONS,
  blockingRiderDocuments,
  canDispatchToRider,
  requiredRiderDocuments,
  riderAge,
  type RiderDecision,
} from "@/lib/rider-onboarding";
import { documentSummary } from "@/lib/onboarding";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ApplicationLog } from "@/components/onboarding/application-log";
import { DocumentList } from "@/components/onboarding/document-list";
import { OnboardingStatusChip } from "@/components/onboarding/status-chip";

/**
 * Which decision reaches each status.
 *
 * `approved` is ambiguous by itself — it is reached by approving a pending
 * application and by activating a rider who was deactivated or suspended — so the
 * screen picks between them from where it is now rather than from where it is going.
 */
const DECISION_FOR: Record<string, RiderDecision> = {
  approved: "approve",
  rejected: "reject",
  suspended: "suspend",
  inactive: "deactivate",
};

/**
 * AdminRiderDetail — one courier, their paperwork, and what they have done
 * (Phase 7, G13).
 *
 * The spec asks for the profile, the documents, the five decisions, a delivery
 * summary and an earnings summary. The last two are the part worth reading: they are
 * **derived from the orders this rider actually delivered**, through
 * `completedOrdersForRider` and the `riderEarning` each completed order stored. Not
 * a second set of figures — §5.4's rule — so this screen, the rider's own earnings
 * page and the platform's books cannot disagree.
 *
 * The action buttons come off `RIDER_TRANSITIONS`, so the graph is the only place
 * the lifecycle is described.
 */
export function AdminRiderDetail({ applicationId }: { applicationId: string }) {
  const t = useTranslations("onboarding");
  const td = useTranslations("dashboard");
  const format = useFormatter();

  const hydrated = useOnboarding((s) => s.hydrated);
  const application = useOnboarding((s) =>
    s.riderApplications.find((a) => a.id === applicationId),
  );
  const decideRider = useOnboarding((s) => s.decideRider);
  const reviewRiderDocument = useOnboarding((s) => s.reviewRiderDocument);

  const ordersHydrated = useOrders((s) => s.hydrated);
  const orders = useOrders((s) => s.orders);
  const shifts = useFleet((s) => s.shifts);

  const reviewer = useAuth((s) => s.user);
  const reviewerName = reviewer?.name ?? t("reviewerFallback");

  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<RiderDecision | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    useOnboarding.persist.rehydrate();
    useOrders.persist.rehydrate();
    useFleet.persist.rehydrate();
    useAuth.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const riderId = application?.riderId ?? null;

  /**
   * What this rider has delivered and earned, off the orders themselves.
   *
   * Pickup orders and any order that never carried a rider earning contribute
   * nothing, because they earned nothing — summing them as zeroes would inflate the
   * trip count with deliveries that were not deliveries.
   */
  const work = useMemo(() => {
    if (!riderId) return null;
    const delivered = completedOrdersForRider(orders, riderId);
    const earnings = delivered
      .map((order) => order.lifecycle.financials?.riderEarning)
      .filter((e): e is NonNullable<typeof e> => e != null);
    return {
      deliveries: earnings.length,
      currency: (earnings[0]?.currency ?? "BDT") as CurrencyCode,
      earned: earnings.reduce((sum, e) => sum + e.payout.total, 0),
      tips: earnings.reduce((sum, e) => sum + e.payout.tip, 0),
      cash: earnings.reduce((sum, e) => sum + e.cashCollected, 0),
      lastAt: delivered[0]?.updatedAt ?? null,
      // Orders on the board that this rider is carrying right now.
      carrying: orders.filter(
        (o) =>
          o.lifecycle.rider?.id === riderId &&
          o.status !== "completed" &&
          o.status !== "delivered",
      ).length,
    };
  }, [orders, riderId]);

  if (!hydrated || !ordersHydrated) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-pill bg-surface" />
        <div className="h-96 animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
          <PackageX className="size-6" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-ink">{t("notFound")}</p>
        <Button href="/admin/riders" variant="outline" size="sm">
          {t("backToRiders")}
        </Button>
      </div>
    );
  }

  const { personal, contact, emergency, vehicleInfo, payout } = application;
  const blocking = blockingRiderDocuments(application, now);
  const documents = documentSummary(application.documents, now);
  const moves = RIDER_TRANSITIONS[application.status];
  const age = riderAge(personal.dateOfBirth, now);
  const onShift =
    application.riderId != null &&
    canDispatchToRider(application.status) &&
    !offShiftRiderIds(shifts).has(application.riderId);

  function decide(decision: RiderDecision, note?: string) {
    setSubmitting(true);
    const result = decideRider(application!.id, { decision, note, by: reviewerName });
    setSubmitting(false);
    setPending(null);
    setReason("");
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    toast.success(t(`riderDecided.${decision}`, { name: personal.name }));
  }

  function start(decision: RiderDecision) {
    if (decision === "reject" || decision === "suspend") {
      setPending(decision);
      setReason("");
      return;
    }
    decide(decision);
  }

  return (
    <div className="space-y-5">
      <Link
        href="/admin/riders"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("backToRiders")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h2 text-ink">{personal.name}</h1>
            <OnboardingStatusChip status={application.status} />
            {canDispatchToRider(application.status) && (
              <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-body">
                {t(onShift ? "availability.free" : "availability.offShift")}
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-sm text-muted">
            {application.applicationNumber}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {moves.map((target) => {
            const decision = DECISION_FOR[target];
            if (!decision) return null;
            // Reaching `approved` from a non-pending status is an *activation*, not
            // a first approval, and the button has to say which one it is.
            const isActivate =
              decision === "approve" && application.status !== "pending";
            const actual: RiderDecision = isActivate ? "activate" : decision;
            const Icon =
              actual === "approve"
                ? Check
                : actual === "activate"
                  ? Play
                  : actual === "deactivate"
                    ? Pause
                    : actual === "reject"
                      ? X
                      : Ban;
            return (
              <Button
                key={target}
                size="sm"
                variant={
                  actual === "approve" || actual === "activate" ? "primary" : "outline"
                }
                disabled={submitting}
                onClick={() => start(actual)}
              >
                <Icon className="size-4" aria-hidden />
                {t(`action.${actual}`)}
              </Button>
            );
          })}
        </div>
      </header>

      {application.status === "pending" && blocking.length > 0 && (
        <p className="rounded-card border border-danger/30 bg-danger/5 p-3 text-sm font-semibold text-danger">
          {t("blockedByDocuments", {
            documents: blocking.map((d) => t(`document.${d.kind}`)).join(", "),
          })}
        </p>
      )}

      {application.decisionNote && (
        <section className="rounded-card border border-line bg-surface p-4">
          <h2 className="text-sm font-bold text-ink">{t("decisionNoteTitle")}</h2>
          <p className="mt-1 text-sm text-body">{application.decisionNote}</p>
          {application.decidedBy && application.decidedAt && (
            <p className="mt-1 text-[11px] text-muted">
              {t("decidedBy", {
                name: application.decidedBy,
                date: format.dateTime(new Date(application.decidedAt), {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }),
              })}
            </p>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title={t("section.personal")}>
            <Facts
              rows={[
                [t("field.dateOfBirth"), personal.dateOfBirth],
                [t("field.age"), age == null ? t("notProvided") : String(age)],
                [t("field.nationalId"), personal.nationalId],
                [t("field.address"), personal.address],
                [t("field.area"), personal.area],
                [t("field.city"), personal.city],
              ]}
            />
          </Panel>

          <Panel title={t("section.contact")}>
            <Facts
              rows={[
                [t("field.phone"), contact.phone],
                [t("field.email"), contact.email],
                [t("field.emergencyName"), emergency.name],
                [t("field.emergencyRelationship"), emergency.relationship],
                [t("field.emergencyPhone"), emergency.phone],
              ]}
            />
          </Panel>

          <Panel title={t("section.vehicle")}>
            <Facts
              rows={[
                [t("field.vehicle"), td(`vehicle.${vehicleInfo.vehicle}`)],
                [t("field.plate"), vehicleInfo.plate ?? t("notApplicable")],
                [t("field.model"), vehicleInfo.model ?? t("notProvided")],
                [
                  t("field.licenceNumber"),
                  vehicleInfo.licenceNumber ?? t("notApplicable"),
                ],
                [t("field.zone"), application.zoneId],
              ]}
            />
          </Panel>

          <Panel
            title={t("section.documents")}
            hint={t("documentSummary", {
              verified: documents.verified,
              total: documents.total,
            })}
          >
            <DocumentList
              documents={application.documents}
              required={requiredRiderDocuments(vehicleInfo.vehicle)}
              now={now}
              onReview={(kind, status, note) => {
                const result = reviewRiderDocument(application.id, kind, status, {
                  authorName: reviewerName,
                  note,
                });
                if (result.error) toast.error(t(result.error));
                else toast.success(t(`documentSet.${status}`));
              }}
            />
          </Panel>
        </div>

        <div className="space-y-4">
          {/* Delivery and earnings summaries — the spec's last two items, derived
              from the orders rather than stored a second time. */}
          <Panel title={t("section.deliverySummary")}>
            {work ? (
              <Facts
                rows={[
                  [t("field.deliveries"), String(work.deliveries)],
                  [t("field.carrying"), String(work.carrying)],
                  [
                    t("field.lastDelivery"),
                    work.lastAt
                      ? format.dateTime(new Date(work.lastAt), {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : t("never"),
                  ],
                ]}
              />
            ) : (
              <p className="text-sm text-muted">{t("noFleetRecord")}</p>
            )}
          </Panel>

          <Panel title={t("section.earningsSummary")}>
            {work ? (
              <Facts
                rows={[
                  [t("field.earned"), formatPrice(work.earned, work.currency)],
                  [t("field.tips"), formatPrice(work.tips, work.currency)],
                  [t("field.cashCollected"), formatPrice(work.cash, work.currency)],
                ]}
              />
            ) : (
              <p className="text-sm text-muted">{t("noFleetRecord")}</p>
            )}
            <p className="mt-3 text-[11px] text-muted">{t("earningsSource")}</p>
          </Panel>

          <Panel title={t("section.payout")}>
            <Facts
              rows={[
                [t("field.payoutMethod"), t(`payoutMethod.${payout.method}`)],
                [t("field.provider"), payout.provider],
                [t("field.accountName"), payout.accountName],
                [t("field.accountNumber"), payout.accountNumber],
              ]}
            />
          </Panel>

          <Panel title={t("section.log")}>
            <ApplicationLog events={application.events} />
          </Panel>
        </div>
      </div>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        labelledBy="rider-decide-title"
        className="sm:max-w-md"
      >
        <div className="p-5 sm:p-6">
          <h2 id="rider-decide-title" className="text-h3 text-ink">
            {pending ? t(`decideTitle.${pending}`) : ""}
          </h2>
          <p className="mt-1 text-sm text-body">
            {pending ? t(`decideBody.${pending}`, { name: personal.name }) : ""}
          </p>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("reasonLabel")}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 400))}
              rows={4}
              placeholder={t("reasonPlaceholder")}
              className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
          <p className="mt-1 text-xs text-muted">{t("reasonHint")}</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="md"
              className="flex-1"
              onClick={() => setPending(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              size="md"
              className="flex-1"
              disabled={reason.trim().length < 8 || submitting}
              onClick={() => pending && decide(pending, reason.trim())}
            >
              {pending ? t(`action.${pending}`) : ""}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">
            {label}
          </dt>
          <dd className="truncate text-sm text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
