"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  EyeOff,
  Loader2,
  MessageSquare,
  PackageX,
  RotateCcw,
  ShoppingBag,
  X,
} from "lucide-react";
import type { SupportOutcome, SupportTicket, SupportTicketStatus } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { useSupport } from "@/stores/support";
import { TICKET_TRANSITIONS, isTicketLive, suggestedRefundAmount } from "@/lib/support";
import { canDecideRefund } from "@/lib/order-machine";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { TicketStatusChip } from "@/components/account/support-view";
import { TicketThread } from "@/components/support/ticket-thread";
import { RefundControls } from "@/components/admin/refund-controls";
import { cn } from "@/lib/utils";

/** Outcomes the desk can pick, with `refused` last because it is the exception. */
const OUTCOMES: readonly SupportOutcome[] = [
  "refunded",
  "credited",
  "replaced",
  "explained",
  "refused",
];

/**
 * AdminSupportDetail — one dispute, and everything needed to end it (Phase 5, G26).
 *
 * The spec's list for this screen is long and every item on it is here, but the
 * arrangement is the argument: the conversation and the order sit side by side,
 * because a decision needs both — an agent who has to leave the ticket to find out
 * what was ordered and whether it was paid for will decide worse.
 *
 * Two things are deliberately *not* duplicated here. The refund is
 * `RefundControls`, the same component the order page uses, writing to the same
 * store — so a refund granted from a ticket and one granted from the order are one
 * record. And resolving a ticket that carries a refund goes through
 * `stores/support.resolve`, which applies the money first and only then lets the
 * ticket claim it: the alternative is a resolution that promises a refund the order
 * refused.
 */
export function AdminSupportDetail({ ticketId }: { ticketId: string }) {
  const t = useTranslations("support");
  const ta = useTranslations("admin");
  const to = useTranslations("order");
  const locale = useLocale();

  const hydrated = useSupport((s) => s.hydrated);
  const ticket = useSupport((s) => s.tickets.find((x) => x.id === ticketId));
  const reply = useSupport((s) => s.reply);
  const move = useSupport((s) => s.move);
  const resolve = useSupport((s) => s.resolve);
  const reopen = useSupport((s) => s.reopen);

  const ordersHydrated = useOrders((s) => s.hydrated);
  const order = useOrders((s) =>
    ticket ? s.orders.find((o) => o.id === ticket.orderId) : undefined,
  );
  const agent = useAuth((s) => s.user);
  const agentName = agent?.name ?? t("deskFallbackName");

  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [decide, setDecide] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    useOrders.persist.rehydrate();
    useSupport.persist.rehydrate();
    useAuth.persist.rehydrate();
  }, []);

  if (!hydrated || !ordersHydrated) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-pill bg-surface" />
        <div className="h-96 animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
          <PackageX className="size-6" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-ink">{t("notFound")}</p>
        <Button href="/admin/support" variant="outline" size="sm">
          {t("backToQueue")}
        </Button>
      </div>
    );
  }

  const currency = ticket.currency as CurrencyCode;
  const live = isTicketLive(ticket.status);
  /** Moves that are not decisions — picking it up, parking it, filing it. */
  const moves = TICKET_TRANSITIONS[ticket.status].filter(
    (target) => target !== "resolved" && target !== "rejected",
  );

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  function send(visibility: "customer" | "internal") {
    const body = (visibility === "internal" ? note : message).trim();
    if (body.length < 2) return;
    setSubmitting(true);
    const result = reply(ticket!.id, {
      author: "agent",
      authorName: agentName,
      body,
      visibility,
    });
    setSubmitting(false);
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    if (visibility === "internal") setNote("");
    else setMessage("");
    toast.success(t(visibility === "internal" ? "noteAdded" : "replySentAgent"));
  }

  function runMove(target: SupportTicketStatus) {
    setSubmitting(true);
    // Reopening is not the same write as parking: it clears the resolution, so it
    // goes through the store action that says so rather than through a bare move.
    const result =
      target === "in-review" && !live
        ? reopen(ticket!.id, { author: "agent", authorName: agentName })
        : move(ticket!.id, target, { author: "agent", authorName: agentName });
    setSubmitting(false);
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    toast.success(t("ticketMoved", { status: t(`status.${target}`) }));
  }

  return (
    <div className="space-y-5">
      <Link
        href="/admin/support"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("backToQueue")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-h2 text-ink">{ticket.ticketNumber}</h1>
            <TicketStatusChip status={ticket.status} />
            <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-body">
              {t(`category.${ticket.category}`)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {t("submittedBy", {
              name: ticket.customerName,
              time: fmtDateTime(ticket.submittedAt),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {live && (
            <Button size="sm" disabled={submitting} onClick={() => setDecide(true)}>
              <Check className="size-4" aria-hidden />
              {t("decideTicket")}
            </Button>
          )}
          {moves.map((target) => (
            <Button
              key={target}
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => runMove(target)}
            >
              {target === "in-review" && !live && (
                <RotateCcw className="size-4" aria-hidden />
              )}
              {t(`moveAction.${target}`)}
            </Button>
          ))}
        </div>
      </header>

      {ticket.resolution && (
        <section
          className={cn(
            "rounded-card border p-4",
            ticket.resolution.outcome === "refused"
              ? "border-danger/30 bg-danger/5"
              : "border-fresh/30 bg-fresh/5",
          )}
        >
          <h2 className="text-sm font-bold text-ink">{t("resolutionTitle")}</h2>
          <p className="mt-1 text-sm font-semibold text-ink">
            {t(`outcome.${ticket.resolution.outcome}`)}
            {ticket.resolution.refundAmount > 0 && (
              <>
                {" · "}
                {formatPrice(ticket.resolution.refundAmount, currency)}
              </>
            )}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-body">
            {ticket.resolution.note}
          </p>
          <p className="mt-2 text-xs text-muted">
            {t("resolutionBy", {
              name: ticket.resolution.by,
              time: fmtDateTime(ticket.resolution.at),
            })}
          </p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* The conversation, plus the two ways of adding to it. */}
        <div className="space-y-4">
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="mb-3 text-h3 text-ink">{t("threadTitle")}</h2>
            {/* The desk sees its own notes. `showInternal` is the only difference
                between this thread and the customer's. */}
            <TicketThread ticket={ticket} showInternal />
          </section>

          <section className="rounded-card border border-primary/30 bg-primary/5 p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <MessageSquare className="size-4 text-primary" aria-hidden />
              {t("respondTitle")}
            </h2>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 800))}
              rows={3}
              placeholder={t("respondPlaceholder")}
              className="mt-2 w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
            />
            <Button
              size="sm"
              className="mt-2"
              disabled={message.trim().length < 2 || submitting}
              onClick={() => send("customer")}
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("respondSend")}
            </Button>
          </section>

          <section className="rounded-card border border-accent/40 bg-accent-50/60 p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <EyeOff className="size-4 text-accent-600" aria-hidden />
              {t("noteTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-muted">{t("noteHint")}</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 800))}
              rows={2}
              placeholder={t("notePlaceholder")}
              className="mt-2 w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
            />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={note.trim().length < 2 || submitting}
              onClick={() => send("internal")}
            >
              {t("noteAdd")}
            </Button>
          </section>
        </div>

        {/* Order and money context. */}
        <div className="space-y-4">
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <ShoppingBag className="size-4 text-muted" aria-hidden />
              {t("orderContext")}
            </h2>
            {order ? (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-ink">
                    {order.orderNumber}
                  </span>
                  <OrderStatusChip status={order.status} size="sm" />
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <Line label={ta("panelRestaurant")} value={order.vendor.name} />
                  <Line label={ta("fieldName")} value={order.contact.name} />
                  <Line label={ta("fieldPhone")} value={ticket.customerPhone} />
                  <Line
                    label={ta("fieldFulfillment")}
                    value={ta(`fulfillment.${order.fulfillment}`)}
                  />
                  <Line
                    label={ta("fieldOrderTotal")}
                    value={formatPrice(order.pricing.total, currency)}
                  />
                  <Line
                    label={ta("fieldMethod")}
                    value={`${to(`payment.${order.payment.method}`, {
                      last4: order.payment.cardLast4 ?? "",
                    })} · ${to(`paymentStatus.${order.payment.status}`)}`}
                  />
                </dl>
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                  {order.lines.map((line) => (
                    <li key={line.id} className="flex justify-between gap-3 text-body">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold text-ink tabular-nums">
                          {line.quantity}×
                        </span>{" "}
                        {line.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {formatPrice(line.unitPrice * line.quantity, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  href={`/admin/orders/${order.id}`}
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                >
                  {t("openOrder")}
                </Button>
              </>
            ) : (
              // The ticket snapshots what it needs, so a missing order degrades to
              // less context rather than to a broken page.
              <div className="mt-3 space-y-1.5 text-sm">
                <p className="text-xs text-muted">{t("orderMissing")}</p>
                <Line label={ta("panelRestaurant")} value={ticket.vendorName} />
                <Line
                  label={ta("fieldOrderTotal")}
                  value={formatPrice(ticket.orderTotal, currency)}
                />
              </div>
            )}
          </section>

          {order && <RefundControls order={order} />}
        </div>
      </div>

      {decide && order && (
        <DecideDialog
          ticket={ticket}
          maxRefund={suggestedRefundAmount(order)}
          refundOpen={canDecideRefund(order)}
          submitting={submitting}
          onClose={() => setDecide(false)}
          onConfirm={(input) => {
            setSubmitting(true);
            const result = resolve(ticket.id, { ...input, by: agentName });
            setSubmitting(false);
            if (result.error) {
              toast.error(t(result.error));
              return;
            }
            setDecide(false);
            toast.success(t("decideDone"));
          }}
        />
      )}
    </div>
  );
}

/**
 * The decision.
 *
 * The refund amount is only offered when the order can actually take one — a ticket
 * about an order that has already been refunded should not present a field that will
 * be refused on submit. The note is required for the same reason the customer's
 * message is: "refused" with no sentence is not a decision anybody can act on.
 */
function DecideDialog({
  ticket,
  maxRefund,
  refundOpen,
  submitting,
  onClose,
  onConfirm,
}: {
  ticket: SupportTicket;
  maxRefund: number;
  refundOpen: boolean;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (input: {
    outcome: SupportOutcome;
    note: string;
    refundAmount?: number;
  }) => void;
}) {
  const t = useTranslations("support");
  const currency = ticket.currency as CurrencyCode;

  const [outcome, setOutcome] = useState<SupportOutcome>("refunded");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(String(maxRefund));

  const wantsRefund = outcome === "refunded" && refundOpen;
  const ready = note.trim().length >= 4;

  return (
    <Modal open onClose={onClose} labelledBy="decide-title" className="sm:max-w-md">
      <div className="p-5 sm:p-6">
        <h2 id="decide-title" className="text-h3 text-ink">
          {t("decideTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">
          {t("decideBody", { ticket: ticket.ticketNumber })}
        </p>

        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            {t("decideOutcomeLabel")}
          </legend>
          <div className="space-y-2">
            {OUTCOMES.map((value) => {
              const selected = outcome === value;
              const blocked = value === "refunded" && !refundOpen;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-field border p-2.5 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary/5 font-semibold text-ink"
                      : "border-line text-body hover:bg-surface-muted",
                    blocked && "opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name="outcome"
                    value={value}
                    checked={selected}
                    disabled={blocked}
                    onChange={() => setOutcome(value)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  {t(`outcome.${value}`)}
                  {blocked && (
                    <span className="ms-auto text-[11px] font-semibold text-muted">
                      {t("refundNotOpenShort")}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        {wantsRefund && (
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("refundAmountLabel", { max: formatPrice(maxRefund, currency) })}
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={maxRefund}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        )}

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
            {t("decideNoteLabel")}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 600))}
            rows={3}
            placeholder={t("decideNotePlaceholder")}
            className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
          />
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" size="md" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            size="md"
            variant={outcome === "refused" ? "danger" : "primary"}
            className="flex-1"
            disabled={!ready || submitting}
            onClick={() =>
              onConfirm({
                outcome,
                note: note.trim(),
                refundAmount: wantsRefund ? Number(amount) : 0,
              })
            }
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : outcome === "refused" ? (
              <X className="size-4" aria-hidden />
            ) : (
              <Check className="size-4" aria-hidden />
            )}
            {t("decideConfirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}
