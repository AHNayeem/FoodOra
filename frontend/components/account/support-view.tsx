"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, LifeBuoy, Loader2, MessageSquarePlus } from "lucide-react";
import type { SupportTicket, SupportTicketStatus } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { customerTickets, useSupport } from "@/stores/support";
import { isTicketLive } from "@/lib/support";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { TicketThread } from "@/components/support/ticket-thread";
import { cn } from "@/lib/utils";

/** Tone per ticket status. Shared by the list chip and the detail header. */
const STATUS_TONE: Record<SupportTicketStatus, string> = {
  open: "bg-accent-50 text-accent-600",
  "in-review": "bg-primary/10 text-primary",
  "awaiting-customer": "bg-accent-50 text-accent-600",
  resolved: "bg-fresh/15 text-fresh-600",
  rejected: "bg-danger/10 text-danger",
  closed: "bg-surface-muted text-muted",
};

export function TicketStatusChip({
  status,
  className,
}: {
  status: SupportTicketStatus;
  className?: string;
}) {
  const t = useTranslations("support");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-bold",
        STATUS_TONE[status],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}

/**
 * SupportView — the customer's tickets (Phase 5, G25).
 *
 * The spec asks the customer to be able to see a ticket's status, the order it is
 * about, when it was submitted, the messages, and the resolution. All five come off
 * the same record the operations desk is working, so there is no version of this
 * screen that is out of date with the desk's.
 */
export function SupportView() {
  const t = useTranslations("support");
  const hydrated = useSupport((s) => s.hydrated);
  const tickets = useSupport((s) => s.tickets);

  useEffect(() => {
    // Orders first: the seed attaches demo tickets to the orders this device holds.
    useOrders.persist.rehydrate();
    useSupport.persist.rehydrate();
  }, []);

  if (!hydrated) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-panel bg-surface" />
        ))}
      </div>
    );
  }

  const mine = customerTickets(tickets);

  if (mine.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-panel border border-line bg-surface p-8 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <LifeBuoy className="size-7" aria-hidden />
        </span>
        <h2 className="text-h3 text-ink">{t("customerEmpty")}</h2>
        <p className="max-w-sm text-body">{t("customerEmptyHint")}</p>
        <Button href="/account/orders" className="mt-2">
          {t("goToOrders")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-h2 text-ink">{t("customerTitle")}</h1>
        <p className="text-sm text-muted">{t("customerSubtitle")}</p>
      </header>
      <ul className="space-y-3">
        {mine.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </ul>
    </div>
  );
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const t = useTranslations("support");
  const locale = useLocale();
  const submitted = new Date(ticket.submittedAt).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="rounded-panel border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-ink">{ticket.ticketNumber}</span>
            <TicketStatusChip status={ticket.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {t(`category.${ticket.category}`)} · {t("submittedAt", { time: submitted })}
          </p>
        </div>
        <Button href={`/account/support/${ticket.id}`} size="sm" variant="outline">
          {t("openTicket")}
        </Button>
      </div>
      <p className="mt-3 text-sm text-body">
        {t("aboutOrder", { number: ticket.orderNumber, vendor: ticket.vendorName })}
      </p>
      {ticket.resolution && (
        <p className="mt-3 rounded-field bg-surface-muted p-3 text-sm text-body">
          <span className="font-semibold text-ink">
            {t(`outcome.${ticket.resolution.outcome}`)}
          </span>{" "}
          {ticket.resolution.note}
        </p>
      )}
    </li>
  );
}

/**
 * SupportTicketView — one conversation, from the customer's side.
 *
 * Replying is offered while the ticket is live and withheld once it is decided:
 * "we resolved this" and a reply box that quietly appends to a closed thread is a
 * worse experience than being told plainly to open a new report. The desk can
 * always reopen it.
 */
export function SupportTicketView({ ticketId }: { ticketId: string }) {
  const t = useTranslations("support");
  const locale = useLocale();

  const hydrated = useSupport((s) => s.hydrated);
  const ticket = useSupport((s) => s.tickets.find((x) => x.id === ticketId));
  const reply = useSupport((s) => s.reply);
  const user = useAuth((s) => s.user);

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    useOrders.persist.rehydrate();
    useSupport.persist.rehydrate();
    useAuth.persist.rehydrate();
  }, []);

  if (!hydrated) {
    return <div className="h-96 animate-pulse rounded-panel bg-surface" />;
  }

  if (!ticket) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line py-16 text-center">
        <p className="text-sm font-semibold text-ink">{t("notFound")}</p>
        <Button href="/account/support" variant="outline" size="sm">
          {t("backToTickets")}
        </Button>
      </div>
    );
  }

  const live = isTicketLive(ticket.status);
  const submitted = new Date(ticket.submittedAt).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function send() {
    const text = body.trim();
    if (text.length < 2) return;
    setSubmitting(true);
    const result = reply(ticket!.id, {
      author: "customer",
      authorName: user?.name ?? ticket!.customerName,
      body: text,
    });
    setSubmitting(false);
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    setBody("");
    toast.success(t("replySent"));
  }

  return (
    <div className="space-y-4">
      <Link
        href="/account/support"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("backToTickets")}
      </Link>

      <header className="rounded-panel border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-h3 text-ink">{ticket.ticketNumber}</h1>
          <TicketStatusChip status={ticket.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {t(`category.${ticket.category}`)} · {t("submittedAt", { time: submitted })}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
          <span className="text-body">
            {t("aboutOrder", { number: ticket.orderNumber, vendor: ticket.vendorName })}
          </span>
          <span className="font-semibold text-ink tabular-nums">
            {formatPrice(ticket.orderTotal, ticket.currency as CurrencyCode)}
          </span>
          <Button
            href={`/orders/${ticket.orderId}`}
            size="sm"
            variant="ghost"
            className="ms-auto"
          >
            {t("viewOrder")}
          </Button>
        </div>
      </header>

      {ticket.resolution && (
        <section
          className={cn(
            "rounded-panel border p-5",
            ticket.resolution.outcome === "refused"
              ? "border-danger/30 bg-danger/5"
              : "border-fresh/30 bg-fresh/5",
          )}
        >
          <h2 className="text-sm font-bold text-ink">{t("resolutionTitle")}</h2>
          <p className="mt-1 text-sm font-semibold text-ink">
            {t(`outcome.${ticket.resolution.outcome}`)}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-body">
            {ticket.resolution.note}
          </p>
          {ticket.resolution.refundAmount > 0 && (
            <p className="mt-2 text-sm font-bold text-ink">
              {t("resolutionRefund", {
                amount: formatPrice(
                  ticket.resolution.refundAmount,
                  ticket.currency as CurrencyCode,
                ),
              })}
            </p>
          )}
        </section>
      )}

      <section className="rounded-panel border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-bold text-ink">{t("threadTitle")}</h2>
        <TicketThread ticket={ticket} />

        {live ? (
          <div className="mt-4 border-t border-line pt-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
                {t("replyLabel")}
              </span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 600))}
                rows={3}
                placeholder={t("replyPlaceholder")}
                className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <Button
              size="md"
              className="mt-2"
              disabled={body.trim().length < 2 || submitting}
              onClick={send}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <MessageSquarePlus className="size-4" aria-hidden />
              )}
              {t("replySend")}
            </Button>
          </div>
        ) : (
          <p className="mt-4 rounded-field bg-surface-muted p-3 text-sm text-muted">
            {t("threadClosed")}
          </p>
        )}
      </section>
    </div>
  );
}
