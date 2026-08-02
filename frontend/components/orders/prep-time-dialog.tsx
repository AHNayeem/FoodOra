"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, Loader2 } from "lucide-react";
import { PREP_TIME_OPTIONS } from "@/frontend/lib/order-lifecycle";
import { Modal } from "@/frontend/components/ui/modal";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";

/**
 * PrepTimeDialog — accepting an order (spec §2).
 *
 * Accepting used to be a bare tap that moved the order to `confirmed` and left
 * the customer's ETA at the hardcoded forty minutes every order got. The
 * restaurant now has to commit to a number, because that number is what the
 * customer's countdown, the kitchen queue's ordering and dispatch's timing are
 * all built on — there is nothing sensible to show until somebody promises it.
 *
 * The machine enforces this too: `transition(order, "confirmed", …)` refuses
 * without `prepMinutes`, so a future surface cannot skip the question.
 */
export function PrepTimeDialog({
  open,
  orderNumber,
  itemCount,
  submitting = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  orderNumber: string;
  itemCount: number;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (minutes: number) => void;
}) {
  const t = useTranslations("dashboard");
  const [minutes, setMinutes] = useState<number>(PREP_TIME_OPTIONS[1]);

  return (
    <Modal open={open} onClose={onClose} labelledBy="prep-title" className="sm:max-w-sm">
      <div className="p-5 sm:p-6">
        <span className="inline-flex size-11 items-center justify-center rounded-pill bg-primary/10 text-primary">
          <Clock className="size-5" aria-hidden />
        </span>
        <h2 id="prep-title" className="mt-3 text-h3 text-ink">
          {t("prepTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">
          {t("prepBody", { number: orderNumber, count: itemCount })}
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("prepTitle")}>
          {PREP_TIME_OPTIONS.map((value) => {
            const selected = minutes === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMinutes(value)}
                className={cn(
                  "rounded-card border-2 py-4 text-center transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-line hover:bg-surface-muted",
                )}
              >
                <span
                  className={cn(
                    "block text-2xl font-extrabold tabular-nums",
                    selected ? "text-primary" : "text-ink",
                  )}
                >
                  {value}
                </span>
                <span className="block text-xs font-semibold text-muted">
                  {t("minutesShort")}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-muted">{t("prepHint")}</p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" size="md" className="flex-1" onClick={onClose}>
            {t("back")}
          </Button>
          <Button
            size="md"
            className="flex-1"
            disabled={submitting}
            onClick={() => onConfirm(minutes)}
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("acceptWithTime", { minutes })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
