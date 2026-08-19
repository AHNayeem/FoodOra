"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * ConfirmDialog — "are you sure?", asked once and reused everywhere.
 *
 * The counterpart to {@link ReasonDialog}: that one exists where an action needs
 * a *reason*, this one where it only needs a second look. Both go through
 * `Modal`, so backdrop-click, Escape, scroll-lock and focus-into-panel behave
 * identically and no caller has to remember any of it.
 *
 * Used for anything irreversible — completing an order closes its books, and a
 * mis-tap should not be able to do that silently.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  submitting = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  /** Defaults to the shared `common.close` label. */
  cancelLabel?: string;
  tone?: "primary" | "danger";
  submitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("common");

  return (
    <Modal open={open} onClose={onClose} labelledBy="confirm-title" className="sm:max-w-sm">
      <div className="p-5 sm:p-6">
        <h2 id="confirm-title" className="text-h3 text-ink">
          {title}
        </h2>
        {body && <p className="mt-1.5 text-sm text-body">{body}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {cancelLabel ?? t("close")}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
