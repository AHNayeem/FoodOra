"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type { ReviewReportReason } from "@/types";
import { REVIEW_REPORT_REASONS } from "@/lib/review-moderation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ReportReviewDialog — "why are you reporting this?" (Phase 13, G29).
 *
 * The flag on a review card used to be a one-tap thank-you that recorded nothing.
 * A report without grounds is not actionable — a moderator opening the queue has
 * to know what they are being asked to look at — so the reason is now collected
 * here, from the **same closed vocabulary** the admin desk cites when it acts
 * (`REVIEW_REPORT_REASONS`). That is what makes "how often is a report of this
 * kind upheld" answerable at all.
 *
 * One dialog for both reporters: a customer flagging abuse on a restaurant page
 * and a restaurant flagging a libellous review on its own board are the same
 * action with a different `byRole`, and the labels are written to suit both.
 *
 * The note is optional. Requiring prose from a customer who is reporting a slur
 * would mostly stop the report being made; the desk can always ask.
 */
export function ReportReviewDialog({
  open,
  submitting = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (reason: ReviewReportReason, note: string) => void;
}) {
  const t = useTranslations("reviews");
  const [reason, setReason] = useState<ReviewReportReason | null>(null);
  const [note, setNote] = useState("");

  function close() {
    setReason(null);
    setNote("");
    onClose();
  }

  return (
    <Modal open={open} onClose={close} labelledBy="report-review-title" className="sm:max-w-md">
      <div className="p-5 sm:p-6">
        <h2 id="report-review-title" className="text-h3 text-ink">
          {t("reportTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">{t("reportBody")}</p>

        <fieldset className="mt-4">
          <legend className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
            {t("reportReasonLabel")}
          </legend>
          <div className="space-y-1.5">
            {REVIEW_REPORT_REASONS.map((value) => {
              const selected = reason === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-field border p-2.5 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary/5 font-semibold text-ink"
                      : "border-line text-body hover:bg-surface-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={value}
                    checked={selected}
                    onChange={() => setReason(value)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  {t(`reportReason.${value}`)}
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
            {t("reportNoteLabel")}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 400))}
            rows={3}
            placeholder={t("reportNotePlaceholder")}
            className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
          />
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" size="md" className="flex-1" onClick={close}>
            {t("reportCancel")}
          </Button>
          <Button
            size="md"
            className="flex-1"
            disabled={!reason || submitting}
            onClick={() => reason && onConfirm(reason, note)}
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("reportConfirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
