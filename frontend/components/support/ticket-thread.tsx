"use client";

import { useLocale, useTranslations } from "next-intl";
import { Banknote, EyeOff, Flag, MessageSquare, User as UserIcon } from "lucide-react";
import type { SupportEvent, SupportTicket } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { customerEvents } from "@/lib/support";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * TicketThread — a support conversation, as it happened.
 *
 * One component for both surfaces, which is what makes the customer's thread and
 * the desk's thread the same conversation rather than two renderings of it. The
 * only difference is `showInternal`: the desk sees its own notes, and the
 * customer's copy is filtered by `lib/support.customerEvents` — the single place
 * that decision is made, so a customer-facing screen cannot leak a note by
 * forgetting a condition.
 *
 * Rendered from the event log rather than from the ticket's status, for the same
 * reason the order timeline is: a status says where a ticket got to, and the log
 * says what people actually said and did.
 */
export function TicketThread({
  ticket,
  showInternal = false,
  className,
}: {
  ticket: SupportTicket;
  /** Desk-only. Internal notes are excluded unless this is explicitly on. */
  showInternal?: boolean;
  className?: string;
}) {
  const events = showInternal ? ticket.events : customerEvents(ticket);

  return (
    <ol className={cn("space-y-3", className)}>
      {events.map((event) => (
        <ThreadRow
          key={event.id}
          event={event}
          currency={ticket.currency as CurrencyCode}
        />
      ))}
    </ol>
  );
}

function ThreadRow({
  event,
  currency,
}: {
  event: SupportEvent;
  currency: CurrencyCode;
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const internal = event.visibility === "internal";
  const mine = event.author === "customer";

  const when = new Date(event.at).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  // A status move and a refund decision are records, not speech — they read as a
  // line across the thread rather than as somebody's message.
  if (event.kind === "status" || event.kind === "refund") {
    return (
      <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 font-semibold",
            event.kind === "refund"
              ? "bg-primary/10 text-primary"
              : "bg-surface-muted text-body",
          )}
        >
          {event.kind === "refund" ? (
            <Banknote className="size-3.5" aria-hidden />
          ) : (
            <Flag className="size-3.5" aria-hidden />
          )}
          {event.kind === "refund" && event.refund
            ? t(`refundEvent.${event.refund.decision}`, {
                amount: formatPrice(event.refund.amount, currency),
              })
            : t(`movedTo.${event.status}`)}
        </span>
        <span className="text-muted">
          {event.authorName} · {when}
        </span>
        {event.body && <span className="w-full text-body">{event.body}</span>}
      </li>
    );
  }

  return (
    <li
      className={cn(
        "rounded-card border p-3",
        internal
          ? "border-accent/40 bg-accent-50"
          : mine
            ? "border-line bg-surface-muted"
            : "border-primary/30 bg-primary/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-bold text-ink">
          {internal ? (
            <EyeOff className="size-3.5 text-accent-600" aria-hidden />
          ) : mine ? (
            <UserIcon className="size-3.5 text-muted" aria-hidden />
          ) : (
            <MessageSquare className="size-3.5 text-primary" aria-hidden />
          )}
          {event.authorName}
        </span>
        <span className="text-muted">{t(`author.${event.author}`)}</span>
        {internal && (
          <span className="rounded-pill bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent-600">
            {t("internalOnly")}
          </span>
        )}
        <time className="ms-auto text-muted">{when}</time>
      </div>
      <p className="mt-1.5 whitespace-pre-line text-sm text-body">{event.body}</p>
    </li>
  );
}
