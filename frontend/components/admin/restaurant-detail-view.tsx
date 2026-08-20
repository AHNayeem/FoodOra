"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  Check,
  PackageX,
  Pencil,
  RotateCcw,
  Store,
  X,
} from "lucide-react";
import type { Vendor, VendorApplication, Weekday } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useAuth } from "@/stores/auth";
import { useOnboarding } from "@/stores/onboarding";
import {
  REQUIRED_VENDOR_DOCUMENTS,
  VENDOR_TRANSITIONS,
  blockingVendorDocuments,
  type VendorDecisionInput,
} from "@/lib/vendor-onboarding";
import { documentSummary } from "@/lib/onboarding";
import { formatPrice } from "@/lib/format";
import { getVendorListing } from "@/services/vendor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApplicationLog } from "@/components/onboarding/application-log";
import { DocumentList } from "@/components/onboarding/document-list";
import { OnboardingStatusChip } from "@/components/onboarding/status-chip";

const WEEK: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Which decisions each status legitimately offers — read off the graph, not listed. */
const DECISION_FOR: Record<string, VendorDecisionInput["decision"]> = {
  approved: "approve",
  rejected: "reject",
  suspended: "suspend",
};

/**
 * AdminRestaurantDetail — one application, and everything needed to decide it
 * (Phase 6, G12).
 *
 * The spec's list for this screen is long and every item is here, but the
 * arrangement is the argument: the paperwork sits beside the business it belongs
 * to, because a reviewer who has to leave the page to see what they are approving
 * will approve worse.
 *
 * Two decisions worth stating. **The action buttons are derived from
 * `VENDOR_TRANSITIONS`, not listed here** — the same rule Phase 4 applied to the
 * admin order page — so a change to the graph reaches this screen without anybody
 * editing it, and this screen can never offer a move the domain would refuse. And
 * **a refusal or a suspension cannot be submitted without a sentence**: the guard is
 * in `decideVendorApplication`, and the dialog simply cannot send an empty one, so
 * the two agree instead of the UI being the only thing enforcing it.
 */
export function AdminRestaurantDetail({ applicationId }: { applicationId: string }) {
  const t = useTranslations("onboarding");
  const format = useFormatter();

  const hydrated = useOnboarding((s) => s.hydrated);
  const application = useOnboarding((s) =>
    s.vendorApplications.find((a) => a.id === applicationId),
  );
  const decideVendor = useOnboarding((s) => s.decideVendor);
  const reviewVendorDocument = useOnboarding((s) => s.reviewVendorDocument);
  const editVendor = useOnboarding((s) => s.editVendor);

  const reviewer = useAuth((s) => s.user);
  const reviewerName = reviewer?.name ?? t("reviewerFallback");

  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<VendorDecisionInput["decision"] | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [listing, setListing] = useState<Vendor | null>(null);

  useEffect(() => {
    useOnboarding.persist.rehydrate();
    useAuth.persist.rehydrate();
  }, []);

  const vendorId = application?.vendorId ?? null;
  useEffect(() => {
    if (!vendorId) return;
    let active = true;
    getVendorListing(vendorId, useOnboarding.getState().admittedVendors).then((v) => {
      if (active) setListing(v);
    });
    return () => {
      active = false;
    };
  }, [vendorId]);

  // Derived rather than cleared in the effect: an application with no listing has
  // nothing to show, and writing that as state would be a render caused by a
  // render.
  const shownListing = vendorId && listing?.id === vendorId ? listing : null;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!hydrated) {
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
        <Button href="/admin/restaurants" variant="outline" size="sm">
          {t("backToRestaurants")}
        </Button>
      </div>
    );
  }

  const { owner, business, restaurant, delivery, payout } = application;
  const currency = "BDT" as CurrencyCode;
  const blocking = blockingVendorDocuments(application, now);
  const documents = documentSummary(application.documents, now);
  /** The moves the graph allows from here, as controls. */
  const moves = VENDOR_TRANSITIONS[application.status];

  function decide(decision: VendorDecisionInput["decision"], note?: string) {
    setSubmitting(true);
    const result = decideVendor(application!.id, { decision, note, by: reviewerName });
    setSubmitting(false);
    setPending(null);
    setReason("");
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    toast.success(t(`decided.${decision}`, { name: restaurant.name }));
  }

  /** A decision that needs a sentence opens the dialog; the rest go straight through. */
  function start(decision: VendorDecisionInput["decision"]) {
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
        href="/admin/restaurants"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("backToRestaurants")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h2 text-ink">{restaurant.name}</h1>
            <OnboardingStatusChip status={application.status} />
          </div>
          <p className="mt-1 font-mono text-sm text-muted">
            {application.applicationNumber}
            {application.submittedAt && (
              <>
                {" · "}
                <span className="font-sans">
                  {t("submittedOn", {
                    date: format.dateTime(new Date(application.submittedAt), {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }),
                  })}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {moves.map((target) => {
            const decision = DECISION_FOR[target];
            if (!decision) return null;
            // `suspended → approved` is a reactivation, and calling it "approve"
            // on the button would misdescribe what the reviewer is doing.
            const isReactivate =
              decision === "approve" && application.status === "suspended";
            const Icon =
              decision === "approve"
                ? isReactivate
                  ? RotateCcw
                  : Check
                : decision === "reject"
                  ? X
                  : Ban;
            return (
              <Button
                key={target}
                size="sm"
                variant={decision === "approve" ? "primary" : "outline"}
                disabled={submitting}
                onClick={() => start(isReactivate ? "reactivate" : decision)}
              >
                <Icon className="size-4" aria-hidden />
                {t(`action.${isReactivate ? "reactivate" : decision}`)}
              </Button>
            );
          })}
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden />
            {t("action.edit")}
          </Button>
        </div>
      </header>

      {/* Why an approval is currently impossible, said before the reviewer presses
          the button and is refused by the domain. */}
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
          <Panel title={t("section.owner")}>
            <Facts
              rows={[
                [t("field.ownerName"), owner.name],
                [t("field.ownerEmail"), owner.email],
                [t("field.ownerPhone"), owner.phone],
                [t("field.nationalId"), owner.nationalId],
              ]}
            />
          </Panel>

          <Panel title={t("section.business")}>
            <Facts
              rows={[
                [t("field.legalName"), business.legalName],
                [t("field.vendorType"), t(`vendorType.${business.vendorType}`)],
                [t("field.tradeLicence"), business.tradeLicence],
                [t("field.tin"), business.tin],
                [t("field.bin"), business.bin ?? t("notProvided")],
                [t("field.yearsTrading"), String(business.yearsTrading)],
              ]}
            />
          </Panel>

          <Panel title={t("section.restaurant")}>
            <Facts
              rows={[
                [t("field.tagline"), restaurant.tagline],
                [t("field.address"), restaurant.location.address],
                [t("field.city"), restaurant.location.city],
                [t("field.contactPhone"), restaurant.phone],
                [t("field.contactEmail"), restaurant.email],
                [t("field.priceLevel"), "$".repeat(restaurant.priceLevel)],
              ]}
            />
            <p className="mt-3 text-sm text-body">{restaurant.description}</p>
          </Panel>

          <Panel title={t("section.hours")}>
            <ul className="grid gap-1 sm:grid-cols-2">
              {WEEK.map((day) => {
                const hours = application.hours[day];
                return (
                  <li key={day} className="flex justify-between gap-3 text-sm">
                    <span className="font-semibold text-ink">{t(`day.${day}`)}</span>
                    <span className="text-muted tabular-nums">
                      {hours.open && hours.close
                        ? `${hours.open} – ${hours.close}`
                        : t("closed")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title={t("section.delivery")}>
            <Facts
              rows={[
                [
                  t("field.fulfilment"),
                  [
                    delivery.offersDelivery ? t("offersDelivery") : null,
                    delivery.offersPickup ? t("offersPickup") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("notProvided"),
                ],
                [t("field.deliveryFee"), formatPrice(delivery.deliveryFee, currency)],
                [t("field.minOrder"), formatPrice(delivery.minOrder, currency)],
                [
                  t("field.freeDeliveryOver"),
                  delivery.freeDeliveryOver == null
                    ? t("never")
                    : formatPrice(delivery.freeDeliveryOver, currency),
                ],
                [
                  t("field.eta"),
                  t("etaRange", {
                    low: delivery.etaMinutes[0],
                    high: delivery.etaMinutes[1],
                  }),
                ],
                [
                  t("field.zones"),
                  delivery.zoneIds.length
                    ? delivery.zoneIds.join(", ")
                    : t("notProvided"),
                ],
              ]}
            />
          </Panel>

          {application.branches.length > 0 && (
            <Panel title={t("section.branches")}>
              <ul className="space-y-2">
                {application.branches.map((branch) => (
                  <li key={branch.id} className="text-sm">
                    <p className="font-semibold text-ink">{branch.name}</p>
                    <p className="text-muted">
                      {branch.address} · {branch.area} · {branch.phone}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title={t("section.documents")}
            hint={t("documentSummary", {
              verified: documents.verified,
              total: documents.total,
            })}
          >
            <DocumentList
              documents={application.documents}
              required={REQUIRED_VENDOR_DOCUMENTS}
              now={now}
              onReview={(kind, status, note) => {
                const result = reviewVendorDocument(application.id, kind, status, {
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
          <Panel title={t("section.payout")}>
            <Facts
              rows={[
                [t("field.payoutMethod"), t(`payoutMethod.${payout.method}`)],
                [t("field.provider"), payout.provider],
                [t("field.accountName"), payout.accountName],
                [t("field.accountNumber"), payout.accountNumber],
                [t("field.branchCode"), payout.branch ?? t("notApplicable")],
              ]}
            />
          </Panel>

          <Panel title={t("section.listing")}>
            {application.vendorId ? (
              <div className="space-y-2 text-sm">
                <p className="font-mono text-xs text-muted">{application.vendorId}</p>
                {/* Only linked once the listing has actually resolved — a minted
                    vendor has no storefront page in the static catalog, and a
                    link into a 404 would look like a broken restaurant. */}
                {shownListing && (
                  <Button
                    href={`/restaurants/${shownListing.slug}`}
                    size="sm"
                    variant="outline"
                  >
                    <Store className="size-4" aria-hidden />
                    {t("viewStorefront")}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">{t("listingOnApproval")}</p>
            )}
          </Panel>

          <Panel title={t("section.log")}>
            <ApplicationLog events={application.events} />
          </Panel>
        </div>
      </div>

      {/* Refusal / suspension — the sentence the owner reads. */}
      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        labelledBy="decide-title"
        className="sm:max-w-md"
      >
        <div className="p-5 sm:p-6">
          <h2 id="decide-title" className="text-h3 text-ink">
            {pending ? t(`decideTitle.${pending}`) : ""}
          </h2>
          <p className="mt-1 text-sm text-body">
            {pending ? t(`decideBody.${pending}`, { name: restaurant.name }) : ""}
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

      {/* Mounted only while open, so its fields start from the application as it
          is now — no effect resetting them, and no stale value from last time. */}
      {editing && (
        <EditDialog
          application={application}
          open
          onClose={() => setEditing(false)}
          onSave={(patch, note) => {
            const result = editVendor(application.id, patch, {
              author: "reviewer",
              authorName: reviewerName,
              note,
            });
            setEditing(false);
            if (result.error) toast.error(t(result.error));
            else toast.success(t("editSaved"));
          }}
        />
      )}
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

/**
 * The spec's "edit" action.
 *
 * Deliberately narrow: the fields a reviewer legitimately corrects on somebody
 * else's behalf are the ones that arrive wrong — a mistyped payout account, a
 * contact number, the trading name. It is *not* a second application form. Letting
 * a reviewer rewrite the description or the cuisines would make the record no longer
 * be what the applicant submitted, which is the one property an audit trail has to
 * keep.
 */
function EditDialog({
  application,
  open,
  onClose,
  onSave,
}: {
  application: VendorApplication;
  open: boolean;
  onClose: () => void;
  onSave: (
    patch: {
      owner: VendorApplication["owner"];
      payout: VendorApplication["payout"];
      business: VendorApplication["business"];
    },
    note: string,
  ) => void;
}) {
  const t = useTranslations("onboarding");
  const [phone, setPhone] = useState(application.owner.phone);
  const [email, setEmail] = useState(application.owner.email);
  const [legalName, setLegalName] = useState(application.business.legalName);
  const [accountNumber, setAccountNumber] = useState(application.payout.accountNumber);
  const [note, setNote] = useState("");

  return (
    <Modal open={open} onClose={onClose} labelledBy="edit-title" className="sm:max-w-md">
      <div className="p-5 sm:p-6">
        <h2 id="edit-title" className="text-h3 text-ink">
          {t("editTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">{t("editBody")}</p>

        <div className="mt-4 space-y-3">
          <Labelled label={t("field.legalName")}>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </Labelled>
          <Labelled label={t("field.ownerPhone")}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Labelled>
          <Labelled label={t("field.ownerEmail")}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Labelled>
          <Labelled label={t("field.accountNumber")}>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </Labelled>
          <Labelled label={t("editNoteLabel")}>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("editNotePlaceholder")}
            />
          </Labelled>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" size="md" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            size="md"
            className="flex-1"
            disabled={note.trim().length < 4}
            onClick={() =>
              onSave(
                {
                  owner: { ...application.owner, phone, email },
                  business: { ...application.business, legalName },
                  payout: { ...application.payout, accountNumber },
                },
                note.trim(),
              )
            }
          >
            {t("saveChanges")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
