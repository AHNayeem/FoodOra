"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bike, Loader2, PackageCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import type { HandoverCheck, Order } from "@/types";
import {
  HANDOVER_CHECKS,
  HANDOVER_MAX_ATTEMPTS,
  isHandoverLocked,
  missingHandoverChecks,
} from "@/lib/order-machine";
import { handoverCodeOf } from "@/lib/order-lifecycle";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/auth/otp-input";
import { cn } from "@/lib/utils";

/** Digits in a handover code — matches `lib/delivery.handoverCodeFor`. */
const CODE_LENGTH = 4;

/**
 * HandoverDialog — the counter releasing the food (Phase 10, G22).
 *
 * The restaurant used to hand an order to a courier with one unconditional tap:
 * `restaurantActions` pushed a plain `handToRider` and nothing was checked, which
 * meant nothing in the prototype distinguished the assigned courier from anybody
 * who happened to be standing at the counter, and nothing recorded that the bag
 * had been looked at. That was G22.
 *
 * Two halves, and both are required by the guard in `lib/order-machine.transition`
 * rather than by this component — the same arrangement as the doorstep OTP and the
 * cash confirmation. There are three surfaces that can collect an order (this
 * dialog is shared by all three) and a check implemented in a dialog is a check the
 * other two do not perform.
 *
 *  - **The checklist** is what was in the bag. All four items, because a checklist
 *    with optional items is a checklist whose optional items are never ticked.
 *  - **The code** is *who* took it. It is derived from the order **and the assigned
 *    courier**, so a courier dispatch never sent cannot produce one, and reassigning
 *    the order retires the old code with nothing having to remember to.
 *
 * `revealCode` is the honest part. On the courier's own screen and on the operations
 * desk the code is shown — the courier has to be able to read it out, and the desk
 * is the platform. On the *restaurant's* screen it is not, because that is the one
 * place where typing it means something: the counter is checking a number it does
 * not already have. The dialog does not pretend this is a secret from the courier
 * standing in front of them; it verifies identity of assignment, and the hint on
 * screen says so.
 */
export function HandoverDialog({
  open,
  order,
  /** Show the code rather than asking for it — the courier's and the desk's view. */
  revealCode = false,
  submitting = false,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  order: Order;
  revealCode?: boolean;
  submitting?: boolean;
  /** Translated error from the last attempt, if any. */
  error: string | null;
  onClose: () => void;
  onConfirm: (input: { code: string; checks: HandoverCheck[] }) => void;
}) {
  const t = useTranslations("handover");
  const [code, setCode] = useState("");
  const [checks, setChecks] = useState<HandoverCheck[]>([]);

  // Clear the field when a *new* rejection comes back, so the counter re-reads the
  // code rather than editing a wrong one digit at a time. Adjusted during render
  // rather than in an effect, matching `OtpDialog`: this is derived from a prop
  // changing, and an effect would render the stale digits once before wiping them.
  const [seenError, setSeenError] = useState<string | null>(null);
  if (error !== seenError) {
    setSeenError(error);
    if (error) setCode("");
  }

  const expected = handoverCodeOf(order);
  const locked = isHandoverLocked(order);
  const left = Math.max(0, HANDOVER_MAX_ATTEMPTS - order.lifecycle.handoverAttempts);
  const missing = missingHandoverChecks(checks);
  const ready = code.length === CODE_LENGTH && missing.length === 0 && !locked;
  const rider = order.lifecycle.rider;

  function toggle(check: HandoverCheck) {
    setChecks((current) =>
      current.includes(check)
        ? current.filter((c) => c !== check)
        : [...current, check],
    );
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="handover-title" className="sm:max-w-md">
      <div className="p-5 sm:p-6">
        <span
          className={cn(
            "inline-flex size-11 items-center justify-center rounded-pill",
            locked ? "bg-danger/10 text-danger" : "bg-fresh-50 text-fresh-600",
          )}
        >
          {locked ? (
            <ShieldAlert className="size-5" aria-hidden />
          ) : (
            <PackageCheck className="size-5" aria-hidden />
          )}
        </span>
        <h2 id="handover-title" className="mt-3 text-h3 text-ink">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-body">
          {t("body", { number: order.orderNumber })}
        </p>

        {/* Who dispatch actually sent. The first checklist item is about this
            panel, so the panel has to carry enough to check them against. */}
        {rider && (
          <div className="mt-4 flex items-center gap-3 rounded-field border border-line bg-surface-alt p-3.5">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary">
              <Bike className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{rider.name}</p>
              <p className="truncate text-xs text-muted">
                {t(`vehicle.${rider.vehicle}`)}
                {rider.plate ? ` · ${rider.plate}` : ""} · {rider.phone}
              </p>
            </div>
          </div>
        )}

        {locked ? (
          <p
            role="alert"
            className="mt-4 rounded-field bg-danger/5 p-3 text-sm font-semibold text-danger"
          >
            {t("locked")}
          </p>
        ) : (
          <>
            <fieldset className="mt-4">
              <legend className="text-xs font-semibold text-muted">
                {t("checklistTitle")}
              </legend>
              <ul className="mt-2 space-y-2">
                {HANDOVER_CHECKS.map((check) => (
                  <li key={check}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-field border border-line bg-surface p-3 transition-colors hover:bg-surface-muted">
                      <input
                        type="checkbox"
                        checked={checks.includes(check)}
                        onChange={() => toggle(check)}
                        disabled={submitting}
                        className="mt-0.5 size-4.5 shrink-0 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">
                          {t(`check.${check}`)}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {t(`checkHint.${check}`)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <div className="mt-5">
              <p className="text-xs font-semibold text-muted">{t("codeTitle")}</p>
              {revealCode && expected && (
                /* The courier's own screen and the desk's. Shown so it can be read
                   out to the counter — see the component header on why this is not
                   a secret and does not need to be. */
                <p className="mt-2 flex items-center gap-2 rounded-field bg-fresh-50 px-3 py-2 text-sm text-fresh-600">
                  <ShieldCheck className="size-4 shrink-0" aria-hidden />
                  <span>
                    {t("codeReveal")}{" "}
                    <b className="font-mono text-base font-extrabold tracking-[0.3em]">
                      {expected}
                    </b>
                  </span>
                </p>
              )}
              <div className="mt-2.5">
                <OtpInput
                  value={code}
                  onChange={setCode}
                  length={CODE_LENGTH}
                  disabled={submitting}
                  ariaLabel={t("codeTitle")}
                />
              </div>
              <p className="mt-2 text-xs text-muted">{t("codeHint")}</p>
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm font-semibold text-danger">
                {error} · {t("attemptsLeft", { count: left })}
              </p>
            )}
          </>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" size="md" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            size="md"
            className="flex-1"
            disabled={!ready || submitting}
            onClick={() => onConfirm({ code, checks })}
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
