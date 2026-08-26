"use client";

import { CheckCircle2, ReceiptText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { CartVendor, QrMenuConfig } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useDineIn } from "@/stores/dine-in";
import { usePlatformDraft } from "@/stores/platform-settings";
import { taxTermsFor } from "@/services/platform-settings";
import { computeQrTotals, roundsLines, roundStatus } from "@/lib/qr";
import { formatPrice } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { QrTotals } from "./qr-totals";

/**
 * QrBillPanel — everything the table has actually ordered (Phase C12).
 *
 * The bill is the sum of *sent* rounds only; the round still being built is
 * deliberately excluded, because a guest scrolling their bill should see what
 * they owe, not what they are considering. Payment stays at the table — this
 * prototype has no dine-in payment rail, and pretending otherwise would be a
 * worse lie than saying so plainly.
 */
export function QrBillPanel({
  vendor,
  config,
  now,
  open,
  onClose,
}: {
  vendor: CartVendor;
  config: QrMenuConfig;
  /** Ticking clock from the parent — drives each round's derived status. */
  now: number;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("qr");
  const currency = vendor.currency as CurrencyCode;

  const rounds = useDineIn((s) => s.rounds);
  const endSession = useDineIn((s) => s.endSession);

  const pricing = computeQrTotals({
    lines: roundsLines(rounds),
    currency: vendor.currency,
    countryCode: vendor.countryCode ?? "BD",
    serviceChargeRate: config.serviceChargeRate,
    // The platform's rate (Phase 19, G30) — see `qr-menu-view`.
    tax: taxTermsFor(vendor.countryCode, usePlatformDraft()),
  });

  function handleEnd() {
    endSession();
    onClose();
    toast.success(t("endSessionDone"));
  }

  const titleId = "qr-bill-title";

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} className="sm:max-w-lg">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4">
        <h2 id={titleId} className="flex items-center gap-2 text-h3 text-ink">
          <ReceiptText className="size-5 text-primary" aria-hidden />
          {t("billTitle")}
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

      {rounds.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="font-semibold text-ink">{t("billEmpty")}</p>
        </div>
      ) : (
        <div className="px-5 py-4">
          <ol className="space-y-4">
            {rounds.map((round) => {
              const status = roundStatus(round, now);
              return (
                <li key={round.id} className="rounded-field border border-line p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-ink">
                      {t("roundLabel", { number: round.roundNumber })}
                    </span>
                    <Badge tone={status === "served" ? "fresh" : "primary"}>
                      {status === "served" && (
                        <CheckCircle2 className="size-3.5" aria-hidden />
                      )}
                      {t(`roundStatus.${status}`)}
                    </Badge>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {round.lines.map((line) => (
                      <li
                        key={line.id}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 text-body">
                          <span className="font-semibold text-ink">{line.quantity}×</span>{" "}
                          {line.name}
                          {line.options.length > 0 && (
                            <span className="text-muted">
                              {" "}
                              · {line.options.map((o) => o.name).join(", ")}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-medium text-ink">
                          {formatPrice(line.unitPrice * line.quantity, currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {round.note && (
                    <p className="mt-2 rounded-field bg-surface-muted px-2.5 py-1.5 text-xs text-body">
                      “{round.note}”
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mt-4">
            <QrTotals pricing={pricing} />
          </div>

          <p className="mt-3 text-center text-xs text-muted">{t("payAtTable")}</p>

          <button
            type="button"
            onClick={handleEnd}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-pill border border-line px-5 text-sm font-semibold text-body transition-colors hover:bg-surface-muted"
          >
            {t("endSession")}
          </button>
        </div>
      )}
    </Modal>
  );
}
