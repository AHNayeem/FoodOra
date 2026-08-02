"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Order } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { OTP_MAX_ATTEMPTS, isOtpLocked } from "@/frontend/lib/order-machine";
import { formatPrice } from "@/frontend/lib/format";
import { Modal } from "@/frontend/components/ui/modal";
import { Button } from "@/frontend/components/ui/button";
import { OtpInput } from "@/frontend/components/auth/otp-input";

/** Digits in a handoff code — matches `lib/delivery.otpFor`. */
const OTP_LENGTH = 4;

/**
 * OtpDialog — the doorstep (spec §7: OTP Verification, mandatory).
 *
 * The code is checked in the seam (`services/orders.verifyOtp`) against the
 * order's own OTP, not in this component, so a wrong code fails even though the
 * button was tappable. Attempts are counted on the order and the rider is locked
 * out after three, which turns "OTP Incorrect" from a toast into an actual
 * branch of the flow — at that point the only ways out are a retry from the
 * customer's side or reporting a failed delivery.
 *
 * Cash orders add a second gate: the rider must confirm the money changed hands
 * before the order can close, because that is the moment a COD order is paid.
 */
export function OtpDialog({
  open,
  order,
  submitting = false,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  order: Order;
  submitting?: boolean;
  /** Translated error from the last attempt, if any. */
  error: string | null;
  onClose: () => void;
  onConfirm: (input: { otp: string; cashCollected: boolean }) => void;
}) {
  const t = useTranslations("delivery");
  const [otp, setOtp] = useState("");
  const [cashCollected, setCashCollected] = useState(false);

  // Clear the field when a *new* rejection comes back, so the rider re-reads the
  // code rather than editing a wrong one digit at a time. Adjusted during render
  // rather than in an effect: this is derived from a prop changing, and an
  // effect would render the stale digits once before wiping them.
  const [seenError, setSeenError] = useState<string | null>(null);
  if (error !== seenError) {
    setSeenError(error);
    if (error) setOtp("");
  }

  const cashDue =
    order.payment.method === "cash" && order.payment.status === "pending"
      ? order.pricing.total
      : 0;
  const locked = isOtpLocked(order);
  const left = Math.max(0, OTP_MAX_ATTEMPTS - order.lifecycle.otpAttempts);
  const ready = otp.length === OTP_LENGTH && (cashDue === 0 || cashCollected) && !locked;

  return (
    <Modal open={open} onClose={onClose} labelledBy="otp-title" className="sm:max-w-sm">
      <div className="p-5 sm:p-6">
        <span
          className={`inline-flex size-11 items-center justify-center rounded-pill ${
            locked ? "bg-danger/10 text-danger" : "bg-fresh-50 text-fresh-600"
          }`}
        >
          {locked ? (
            <ShieldAlert className="size-5" aria-hidden />
          ) : (
            <ShieldCheck className="size-5" aria-hidden />
          )}
        </span>
        <h2 id="otp-title" className="mt-3 text-h3 text-ink">
          {t("otpTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">
          {t("otpBody", { name: order.contact.name, number: order.orderNumber })}
        </p>

        {locked ? (
          <p role="alert" className="mt-4 rounded-field bg-danger/5 p-3 text-sm font-semibold text-danger">
            {t("otpLocked")}
          </p>
        ) : (
          <>
            <div className="mt-5">
              <OtpInput
                value={otp}
                onChange={setOtp}
                length={OTP_LENGTH}
                disabled={submitting}
                ariaLabel={t("otpTitle")}
              />
            </div>

            {cashDue > 0 && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-field border border-line bg-surface-alt p-3.5">
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
                      amount: formatPrice(cashDue, order.pricing.currency as CurrencyCode),
                    })}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {t("cashConfirmHint")}
                  </span>
                </span>
              </label>
            )}

            {error && (
              <p role="alert" className="mt-4 text-sm font-semibold text-danger">
                {error} · {t("otpAttemptsLeft", { count: left })}
              </p>
            )}
          </>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" size="md" className="flex-1" onClick={onClose}>
            {t("close")}
          </Button>
          <Button
            size="md"
            className="flex-1"
            disabled={!ready || submitting}
            onClick={() => onConfirm({ otp, cashCollected })}
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("confirmDelivery")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
