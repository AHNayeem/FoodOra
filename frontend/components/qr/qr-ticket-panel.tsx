"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { CartVendor, QrMenuConfig } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useDineIn } from "@/stores/dine-in";
import { sendRound } from "@/services/qr";
import { computeQrTotals } from "@/lib/qr";
import { formatPrice } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { QuantityStepper } from "@/components/cart/quantity-stepper";
import { QrTotals } from "./qr-totals";

/**
 * QrTicketPanel — review and fire the round being built (Phase C12).
 *
 * The estimate here is the *round*, not the bill: a table orders in waves, so
 * the guest needs to see what this wave costs before it reaches the kitchen.
 * The running bill across every sent round lives in `QrBillPanel`.
 */
export function QrTicketPanel({
  vendor,
  config,
  open,
  onClose,
}: {
  vendor: CartVendor;
  config: QrMenuConfig;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("qr");
  const currency = vendor.currency as CurrencyCode;

  const lines = useDineIn((s) => s.lines);
  const rounds = useDineIn((s) => s.rounds);
  const tableId = useDineIn((s) => s.tableId);
  const guestName = useDineIn((s) => s.guestName);
  const setQuantity = useDineIn((s) => s.setQuantity);
  const commitRound = useDineIn((s) => s.commitRound);

  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const pricing = computeQrTotals({
    lines,
    currency: vendor.currency,
    countryCode: vendor.countryCode ?? "BD",
    serviceChargeRate: config.serviceChargeRate,
  });

  async function handleSend() {
    setSending(true);
    const roundNumber = rounds.length + 1;
    const { data, error } = await sendRound({
      vendorId: vendor.id,
      tableId,
      guestName,
      lines,
      note: note.trim(),
      roundNumber,
    });
    setSending(false);

    if (error || !data) {
      toast.error(t(error ?? "errors.generic"));
      return;
    }

    commitRound(data);
    setNote("");
    toast.success(t("sentBody", { number: data.roundNumber }));
  }

  const titleId = "qr-ticket-title";

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} className="sm:max-w-lg">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4">
        <h2 id={titleId} className="text-h3 text-ink">
          {t("currentRound")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="inline-flex size-9 items-center justify-center rounded-pill text-body transition-colors hover:bg-surface-muted"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="font-semibold text-ink">{t("emptyRound")}</p>
          <p className="mt-1 text-sm text-muted">{t("emptyRoundHint")}</p>
        </div>
      ) : (
        <div className="px-5 py-4">
          <ul className="divide-y divide-line">
            {lines.map((line) => (
              <li key={line.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{line.name}</p>
                  {line.options.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted">
                      {line.options.map((o) => o.name).join(" · ")}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-body">
                    {formatPrice(line.unitPrice * line.quantity, currency)}
                  </p>
                </div>
                <QuantityStepper
                  value={line.quantity}
                  onChange={(next) => setQuantity(line.id, next)}
                  removable
                  decrementLabel={t("decrease", { name: line.name })}
                  incrementLabel={t("increase", { name: line.name })}
                />
              </li>
            ))}
          </ul>

          <label className="mt-4 block">
            <span className="text-sm font-semibold text-ink">{t("roundNote")}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={t("roundNotePlaceholder")}
              className="mt-1.5 w-full resize-none rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </label>

          <div className="mt-4">
            <QrTotals pricing={pricing} />
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="mt-4 inline-flex h-13 w-full items-center justify-center gap-2 rounded-pill bg-primary px-5 font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          >
            <Send className="size-4.5 rtl:-scale-x-100" aria-hidden />
            {sending
              ? t("sending")
              : t("sendToKitchen", { amount: formatPrice(pricing.total, currency) })}
          </button>
        </div>
      )}
    </Modal>
  );
}
