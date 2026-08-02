"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type { OrderCancelReason } from "@/frontend/types";
import { Modal } from "@/frontend/components/ui/modal";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";

/**
 * ReasonDialog — "why?", asked once and reused everywhere.
 *
 * The prototype previously ended orders with a single unexplained tap: reject
 * was one button, cancel was one button, and neither recorded a reason, so the
 * customer was told nothing and the timeline had nothing to show. Every ending
 * now goes through here — restaurant rejection, either side's cancellation, and
 * a failed doorstep handoff — with the reason written into the event log.
 *
 * Reason lists come from `lib/order-lifecycle` so the vocabulary is data, and
 * the labels come from `order.reason.*` so all three locales stay in step.
 */
export function ReasonDialog({
  open,
  title,
  body,
  reasons,
  confirmLabel,
  submitting = false,
  tone = "danger",
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body?: string;
  reasons: readonly OrderCancelReason[];
  confirmLabel: string;
  submitting?: boolean;
  tone?: "danger" | "primary";
  onClose: () => void;
  onConfirm: (reason: OrderCancelReason, note: string) => void;
}) {
  const t = useTranslations("order");
  const [reason, setReason] = useState<OrderCancelReason | null>(null);
  const [note, setNote] = useState("");

  function close() {
    setReason(null);
    setNote("");
    onClose();
  }

  return (
    <Modal open={open} onClose={close} labelledBy="reason-title" className="sm:max-w-sm">
      <div className="p-5 sm:p-6">
        <h2 id="reason-title" className="text-h3 text-ink">
          {title}
        </h2>
        {body && <p className="mt-1.5 text-sm text-body">{body}</p>}

        <fieldset className="mt-4">
          <legend className="sr-only">{title}</legend>
          <div className="space-y-2">
            {reasons.map((value) => {
              const selected = reason === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-field border p-3 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary/5 font-semibold text-ink"
                      : "border-line text-body hover:bg-surface-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={value}
                    checked={selected}
                    onChange={() => setReason(value)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  {t(`reason.${value}`)}
                </label>
              );
            })}
          </div>
        </fieldset>

        {reason === "other" && (
          <label className="mt-3 block">
            <span className="sr-only">{t("reasonNoteLabel")}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={140}
              placeholder={t("reasonNotePlaceholder")}
              className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" size="md" className="flex-1" onClick={close}>
            {t("back")}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="md"
            className="flex-1"
            disabled={!reason || submitting}
            onClick={() => reason && onConfirm(reason, note.trim())}
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
