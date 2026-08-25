"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  PackageX,
  PenLine,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  User,
} from "lucide-react";
import type { ReviewQueueRow, ReviewReportReason } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { getModerationRow } from "@/services/reviews";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { useReviewContext, useReviews } from "@/stores/reviews";
import { useReviewModeration } from "@/stores/review-moderation";
import {
  MIN_MODERATION_NOTE,
  REVIEW_REPORT_REASONS,
} from "@/lib/review-moderation";
import { formatPrice } from "@/lib/format";
import { ReviewCard } from "@/components/reviews/review-card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { MODERATION_TONE } from "./review-queue-view";

/** The four things a moderator can do, and the dialog each one opens. */
type Pending = "approve" | "hide" | "remove" | "restore" | "note";

/**
 * AdminReviewModerationDetail — one reported review, with everything needed to
 * decide about it (Phase 13, G29).
 *
 * The spec asks for review details, customer context, vendor context, order
 * context, approve/leave, hide/remove, a moderation reason and the moderation
 * history. They are all here, and the ordering on the screen is the order a
 * decision is actually made in: read what was written, see who objected and why,
 * check whether there was an order behind it at all, look at what the author has
 * done before — and only then act.
 *
 * The review itself is rendered with the **same `ReviewCard` the storefront
 * uses**, deliberately: a moderator has to see exactly what a customer sees,
 * including the restaurant's public reply, rather than a summarised version of
 * it.
 *
 * Every decision goes through `stores/review-moderation` into
 * `lib/review-moderation`, so the rules (grounds required, note of at least eight
 * characters, a removed review cannot be restored) hold here and would hold for
 * any other client. The disabled buttons are a courtesy; the domain is the rule.
 */
export function AdminReviewModerationDetail({ reviewId }: { reviewId: string }) {
  const t = useTranslations("moderation");
  /** The grounds vocabulary, shared with the customer-facing report dialog. */
  const tr = useTranslations("reviews");
  const format = useFormatter();

  const ctx = useReviewContext();
  const orders = useOrders((s) => s.orders);
  const ordersHydrated = useOrders((s) => s.hydrated);
  const moderationHydrated = useReviewModeration((s) => s.hydrated);
  const approve = useReviewModeration((s) => s.approve);
  const hide = useReviewModeration((s) => s.hide);
  const remove = useReviewModeration((s) => s.remove);
  const restore = useReviewModeration((s) => s.restore);
  const addNote = useReviewModeration((s) => s.addNote);

  const moderator = useAuth((s) => s.user);
  const moderatorName = moderator?.name ?? "Platform desk";

  const [state, setState] = useState<{ nowMs: number; row: ReviewQueueRow | null } | null>(
    null,
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState<ReviewReportReason | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    useOrders.persist.rehydrate();
    useReviews.persist.rehydrate();
    useAuth.persist.rehydrate();
    void useReviewModeration.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!ordersHydrated || !moderationHydrated) return;
    let live = true;
    getModerationRow(reviewId, ctx, orders).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [reviewId, ctx, orders, ordersHydrated, moderationHydrated]);

  function close() {
    setPending(null);
    setReason(null);
    setNote("");
    setSubmitting(false);
  }

  /** Run one decision, report what the domain said, and close up. */
  function commit(action: Pending) {
    setSubmitting(true);
    const result =
      action === "approve"
        ? approve(reviewId, { note: note.trim() || null, by: moderatorName })
        : action === "hide"
          ? hide(reviewId, { reason: reason!, note, by: moderatorName })
          : action === "remove"
            ? remove(reviewId, { reason: reason!, note, by: moderatorName })
            : action === "restore"
              ? restore(reviewId, { note: note.trim() || null, by: moderatorName })
              : addNote(reviewId, { body: note, by: moderatorName });

    if (result.error) {
      setSubmitting(false);
      toast.error(t(result.error));
      return;
    }
    toast.success(t(`toast.${action}`));
    close();
  }

  if (!state) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-pill bg-surface" />
        <div className="h-96 animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  if (!state.row) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
          <PackageX className="size-6" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-ink">{t("notFound")}</p>
        <p className="max-w-sm text-xs text-muted">{t("notFoundHint")}</p>
        <Button href="/admin/reviews" variant="outline" size="sm">
          {t("back")}
        </Button>
      </div>
    );
  }

  const { review, record, vendor, order, author } = state.row;
  const canDecide = record.status !== "removed";
  const noteTooShort = note.trim().length < MIN_MODERATION_NOTE;

  return (
    <div className="space-y-5">
      <Link
        href="/admin/reviews"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-body hover:text-ink"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("detailTitle")}</h1>
          <p className="text-sm text-muted">
            {t("detailSubtitle", {
              reference: review.orderNumber ?? t("noReference"),
              ago: format.relativeTime(new Date(review.createdAt), state.nowMs),
            })}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex rounded-pill px-3 py-1.5 text-sm font-semibold",
            MODERATION_TONE[record.status],
          )}
        >
          {t(`status.${record.status}`)}
        </span>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          {/* What was actually written — the same card the storefront renders. */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              {t("theReview")}
            </h2>
            <ReviewCard review={review} nowMs={state.nowMs} />
            {!review.verified && (
              <p className="mt-2 text-xs text-muted">{t("unverifiedNote")}</p>
            )}
          </section>

          {/* Who objected, and on what grounds. */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              {t("reports", { count: record.reports.length })}
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {record.reports.map((report) => (
                <li key={report.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-pill bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
                      <Flag className="size-3" aria-hidden />
                      {tr(`reportReason.${report.reason}`)}
                    </span>
                    <span className="text-sm font-semibold text-ink">{report.by}</span>
                    <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted">
                      {t(`role.${report.byRole}`)}
                    </span>
                    <span className="text-xs text-muted">
                      {format.relativeTime(new Date(report.at), state.nowMs)}
                    </span>
                  </div>
                  {report.body && (
                    <p className="mt-1.5 whitespace-pre-line text-sm text-body">
                      {report.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* The audit trail. A status can say a review is hidden but never who
              hid it, when, or why — which is exactly what is asked for later. */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              {t("history")}
            </h2>
            <ol className="space-y-2.5 rounded-card border border-line bg-surface p-4">
              {record.moderation.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span className="mt-1 inline-flex size-2 shrink-0 rounded-pill bg-line" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {t(`action.${event.action}`)}
                      {event.reason && (
                        <span className="font-normal text-muted">
                          {" · "}
                          {tr(`reportReason.${event.reason}`)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {t("byAt", {
                        by: event.by,
                        at: format.dateTime(new Date(event.at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })}
                    </p>
                    {event.body && (
                      <p className="mt-1 whitespace-pre-line text-sm text-body">{event.body}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          {/* The decision. */}
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
              {t("decision")}
            </h2>
            <p className="mt-1.5 text-xs text-body">
              {record.status === "removed"
                ? t("decisionRemoved")
                : record.status === "hidden"
                  ? t("decisionHidden")
                  : record.status === "approved"
                    ? t("decisionApproved")
                    : t("decisionPending")}
            </p>
            {record.decidedBy && record.decidedAt && (
              <p className="mt-1 text-xs text-muted">
                {t("byAt", {
                  by: record.decidedBy,
                  at: format.dateTime(new Date(record.decidedAt), { dateStyle: "medium" }),
                })}
              </p>
            )}

            <div className="mt-3 space-y-2">
              {record.status !== "approved" && record.status !== "removed" && (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => setPending(record.status === "hidden" ? "restore" : "approve")}
                >
                  {record.status === "hidden" ? (
                    <>
                      <Eye className="size-4" aria-hidden />
                      {t("restore")}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-4" aria-hidden />
                      {t("approve")}
                    </>
                  )}
                </Button>
              )}
              {canDecide && record.status !== "hidden" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setPending("hide")}
                >
                  <EyeOff className="size-4" aria-hidden />
                  {t("hide")}
                </Button>
              )}
              {canDecide && (
                <Button
                  size="sm"
                  variant="danger"
                  className="w-full"
                  onClick={() => setPending("remove")}
                >
                  <Trash2 className="size-4" aria-hidden />
                  {t("remove")}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                onClick={() => setPending("note")}
              >
                <PenLine className="size-4" aria-hidden />
                {t("addNote")}
              </Button>
            </div>
          </section>

          {/* Vendor context. */}
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
              <Store className="size-4" aria-hidden />
              {t("vendorContext")}
            </h2>
            {vendor ? (
              <>
                <p className="mt-1.5 text-sm font-semibold text-ink">{vendor.name}</p>
                <p className="text-xs text-muted tabular-nums">
                  {t("vendorRating", {
                    rating: vendor.rating.toFixed(1),
                    count: vendor.reviewCount,
                  })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button href={`/admin/restaurants/${vendor.id}`} size="sm" variant="outline">
                    {t("openRestaurant")}
                  </Button>
                  <Button href={`/restaurants/${vendor.slug}`} size="sm" variant="ghost">
                    {t("openStorefront")}
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-1.5 text-xs text-muted">{t("noVendor")}</p>
            )}
          </section>

          {/* Order context — the only hard evidence that anything was bought. */}
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
              <ShoppingBag className="size-4" aria-hidden />
              {t("orderContext")}
            </h2>
            {order ? (
              <>
                <p className="mt-1.5 font-mono text-sm font-bold text-ink">
                  {order.orderNumber}
                </p>
                <p className="text-xs text-muted">
                  {t("orderLine", {
                    status: order.status,
                    total: formatPrice(order.total, order.currency as CurrencyCode),
                    at: format.dateTime(new Date(order.placedAt), { dateStyle: "medium" }),
                  })}
                </p>
                <Button
                  href={`/admin/orders/${order.id}`}
                  size="sm"
                  variant="outline"
                  className="mt-2"
                >
                  {t("openOrder")}
                </Button>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-sm text-ink">
                  {review.orderNumber ?? t("noReference")}
                </p>
                <p className="text-xs text-muted">{t("orderNotHeld")}</p>
              </>
            )}
          </section>

          {/* Customer context. */}
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
              <User className="size-4" aria-hidden />
              {t("customerContext")}
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
              {author.name}
              {author.verified && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-fresh-600">
                  <BadgeCheck className="size-3.5" aria-hidden />
                  {t("verified")}
                </span>
              )}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              <li>{t("authorReviewsHere", { count: author.reviewsHere })}</li>
              <li>{t("authorReported", { count: author.reported })}</li>
              <li>{t("authorActioned", { count: author.actioned })}</li>
            </ul>
            {author.customerId ? (
              <Button
                href={`/admin/customers/${author.customerId}`}
                size="sm"
                variant="outline"
                className="mt-2"
              >
                {t("openCustomer")}
              </Button>
            ) : (
              <p className="mt-2 text-xs text-muted">{t("noCustomerLink")}</p>
            )}
          </section>
        </aside>
      </div>

      {/* Hide / remove — grounds *and* prose, because that is what the author and
          the restaurant get answered from if either disputes it. */}
      <Modal
        open={pending === "hide" || pending === "remove"}
        onClose={close}
        labelledBy="moderate-title"
        className="sm:max-w-md"
      >
        <div className="p-5 sm:p-6">
          <h2 id="moderate-title" className="text-h3 text-ink">
            {pending === "remove" ? t("removeTitle") : t("hideTitle")}
          </h2>
          <p className="mt-1 text-sm text-body">
            {pending === "remove" ? t("removeBody") : t("hideBody")}
          </p>

          <fieldset className="mt-4">
            <legend className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("reasonLabel")}
            </legend>
            <div className="space-y-1.5">
              {REVIEW_REPORT_REASONS.map((value) => {
                const selected = reason === value;
                return (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-field border p-2.5 text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary/5 font-semibold text-ink"
                        : "border-line text-body hover:bg-surface-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="moderation-reason"
                      value={value}
                      checked={selected}
                      onChange={() => setReason(value)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    {tr(`reportReason.${value}`)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("noteLabel")}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 400))}
              rows={4}
              placeholder={t("notePlaceholder")}
              className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
          <p className="mt-1 text-xs text-muted">
            {t("noteHint", { count: MIN_MODERATION_NOTE })}
          </p>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="md" className="flex-1" onClick={close}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              size="md"
              className="flex-1"
              disabled={!reason || noteTooShort || submitting}
              onClick={() => commit(pending === "remove" ? "remove" : "hide")}
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {pending === "remove" ? t("removeConfirm") : t("hideConfirm")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Approve / restore — a review that broke no rule needs no argument, so the
          note is optional here. The same asymmetry unblocking an account follows. */}
      <Modal
        open={pending === "approve" || pending === "restore"}
        onClose={close}
        labelledBy="approve-title"
        className="sm:max-w-sm"
      >
        <div className="p-5 sm:p-6">
          <h2 id="approve-title" className="text-h3 text-ink">
            {pending === "restore" ? t("restoreTitle") : t("approveTitle")}
          </h2>
          <p className="mt-1 text-sm text-body">
            {pending === "restore" ? t("restoreBody") : t("approveBody")}
          </p>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("noteOptionalLabel")}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 400))}
              rows={3}
              placeholder={t("notePlaceholder")}
              className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="md" className="flex-1" onClick={close}>
              {t("cancel")}
            </Button>
            <Button
              size="md"
              className="flex-1"
              disabled={submitting}
              onClick={() => commit(pending === "restore" ? "restore" : "approve")}
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {pending === "restore" ? t("restoreConfirm") : t("approveConfirm")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* A note changes nothing, which is exactly why it is worth having. */}
      <Modal
        open={pending === "note"}
        onClose={close}
        labelledBy="note-title"
        className="sm:max-w-sm"
      >
        <div className="p-5 sm:p-6">
          <h2 id="note-title" className="text-h3 text-ink">
            {t("noteTitle")}
          </h2>
          <p className="mt-1 text-sm text-body">{t("noteBody")}</p>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("noteLabel")}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 400))}
              rows={4}
              placeholder={t("notePlaceholder")}
              className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
          <p className="mt-1 text-xs text-muted">
            {t("noteHint", { count: MIN_MODERATION_NOTE })}
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="md" className="flex-1" onClick={close}>
              {t("cancel")}
            </Button>
            <Button
              size="md"
              className="flex-1"
              disabled={noteTooShort || submitting}
              onClick={() => commit("note")}
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("noteConfirm")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
