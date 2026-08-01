"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, ShieldCheck, X } from "lucide-react";
import type { DeliveryStop } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { Modal } from "@/components/ui/modal";
import { OtpInput } from "@/components/auth/otp-input";
import { formatPrice } from "@/lib/format";

/** Digits in a handoff code — matches `lib/delivery.otpFor`. */
const OTP_LENGTH = 4;

/**
 * HandoffDialog — the doorstep (Phase C18; spec: OTP Verification, Cash
 * Collection).
 *
 * Two things have to be true before an order is someone else's food: the customer
 * proved they are the customer, and any cash actually changed hands. Both are
 * collected here and *checked in the seam*, so a wrong code fails even though the
 * button was tappable — which is the point of a verification step.
 */
export function HandoffDialog({
  stop,
  currency,
  open,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  stop: DeliveryStop;
  currency: string;
  open: boolean;
  submitting: boolean;
  /** Translated error from the seam's last attempt, if any. */
  error: string | null;
  onClose: () => void;
  onConfirm: (input: { otp: string; cashCollected: boolean }) => void;
}) {
  const t = useTranslations("delivery");
  const [otp, setOtp] = useState("");
  const [cashCollected, setCashCollected] = useState(false);

  const needsCash = stop.cashDue > 0;
  const ready = otp.length === OTP_LENGTH && (!needsCash || cashCollected);

  return (
    <Modal open={open} onClose={onClose} labelledBy="handoff-title" className="sm:max-w-sm">
      <div className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div>
          <h2 id="handoff-title" className="text-h3 text-ink">
            {t("handoffTitle")}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {stop.name} · {stop.orderNumber}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <X className="size-4.5" aria-hidden />
        </button>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck className="size-4 text-fresh-600" aria-hidden />
            {t("otpLabel")}
          </p>
          <p className="mt-1 text-xs text-muted">{t("otpHint")}</p>
          <div className="mt-3">
            <OtpInput
              value={otp}
              onChange={setOtp}
              length={OTP_LENGTH}
              disabled={submitting}
              ariaLabel={t("otpLabel")}
            />
          </div>
        </div>

        {needsCash && (
          <label className="flex cursor-pointer items-start gap-3 rounded-field border border-line bg-surface-alt p-3.5">
            <input
              type="checkbox"
              checked={cashCollected}
              onChange={(e) => setCashCollected(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 size-4.5 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Banknote className="size-4 text-accent-600" aria-hidden />
                {t("cashConfirm", {
                  amount: formatPrice(stop.cashDue, currency as CurrencyCode),
                })}
              </span>
              <span className="mt-0.5 block text-xs text-muted">{t("cashConfirmHint")}</span>
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => onConfirm({ otp, cashCollected })}
          disabled={!ready || submitting}
          className="h-12 w-full rounded-pill bg-primary text-sm font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
        >
          {submitting ? t("verifying") : t("completeDelivery")}
        </button>
        <p className="text-center text-xs text-muted">{t("otpFooter")}</p>
      </div>
    </Modal>
  );
}
