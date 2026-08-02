"use client";

import { useTranslations, useFormatter } from "next-intl";
import { PauseCircle, RotateCcw, Trash2, X } from "lucide-react";
import type { PosHeldTicket } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { formatPrice } from "@/lib/format";
import { ticketCount, ticketSubtotal } from "@/lib/pos";
import { Modal } from "@/components/ui/modal";

/**
 * PosHeldTicketsDialog — the parked-orders drawer. Lists held tickets so the
 * cashier can recall one back onto the terminal or discard it.
 */
export function PosHeldTicketsDialog({
  open,
  onClose,
  heldTickets,
  currency,
  onRecall,
  onDiscard,
}: {
  open: boolean;
  onClose: () => void;
  heldTickets: PosHeldTicket[];
  currency: CurrencyCode;
  onRecall: (ticket: PosHeldTicket) => void;
  onDiscard: (id: string) => void;
}) {
  const t = useTranslations("pos");
  const format = useFormatter();

  return (
    <Modal open={open} onClose={onClose} labelledBy="pos-held-title" className="sm:max-w-md">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="pos-held-title" className="flex items-center gap-2 text-h4 font-bold text-ink">
          <PauseCircle className="size-5 text-accent" aria-hidden />
          {t("heldTickets")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="inline-flex size-8 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <X className="size-4.5" aria-hidden />
        </button>
      </div>

      <div className="px-5 py-4">
        {heldTickets.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">{t("noHeld")}</p>
        ) : (
          <ul className="space-y-2.5">
            {heldTickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-ink">
                      {ticket.label}
                    </p>
                    <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted">
                      {t(`orderType.${ticket.orderType}`)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {t("itemsCount", { count: ticketCount(ticket.lines) })} ·{" "}
                    <span className="font-semibold text-body tabular-nums">
                      {formatPrice(ticketSubtotal(ticket.lines), currency)}
                    </span>{" "}
                    ·{" "}
                    {format.dateTime(new Date(ticket.heldAt), {
                      hour: "numeric",
                      minute: "numeric",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRecall(ticket)}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  {t("recall")}
                </button>
                <button
                  type="button"
                  onClick={() => onDiscard(ticket.id)}
                  aria-label={t("deleteHeld")}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
