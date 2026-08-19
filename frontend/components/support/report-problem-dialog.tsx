"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Order, SupportCategory } from "@/types";
import { useAuth } from "@/stores/auth";
import { useSupport } from "@/stores/support";
import { SUPPORT_CATEGORIES } from "@/lib/support";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Enough to be useful to an agent; short enough that nobody writes an essay. */
const MAX_MESSAGE = 600;
const MIN_MESSAGE = 10;

/**
 * ReportProblemDialog — "Report a Problem" (Phase 5, G25).
 *
 * The prototype's answer to a wrong order used to be a static FAQ and a `mailto:`,
 * which meant the complaint left the product: no record, no status, nothing for the
 * operations desk to pick up. This is the form that keeps it inside.
 *
 * Two decisions worth stating. The category list is the spec's, as data
 * (`SUPPORT_CATEGORIES`) rather than markup, so the form and any future report on
 * those categories are reading the same vocabulary. And the message is *required* —
 * a ticket whose whole content is "wrong item" gives an agent nothing to act on, so
 * the button stays disabled until there is a sentence.
 */
export function ReportProblemDialog({
  order,
  open,
  onClose,
}: {
  order: Order;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("support");
  const router = useRouter();
  const openTicket = useSupport((s) => s.openTicket);
  const user = useAuth((s) => s.user);

  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const ready = category !== null && message.trim().length >= MIN_MESSAGE;

  function close() {
    setCategory(null);
    setMessage("");
    onClose();
  }

  function submit() {
    if (!category) return;
    setSubmitting(true);
    const ticket = openTicket({
      order,
      category,
      message: message.trim(),
      reportedBy: user?.name ?? order.contact.name,
    });
    setSubmitting(false);
    close();
    toast.success(t("reportSent", { ticket: ticket.ticketNumber }));
    router.push(`/account/support/${ticket.id}`);
  }

  return (
    <Modal open={open} onClose={close} labelledBy="report-title" className="sm:max-w-md">
      <div className="p-5 sm:p-6">
        <h2 id="report-title" className="text-h3 text-ink">
          {t("reportTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">
          {t("reportBody", { number: order.orderNumber, vendor: order.vendor.name })}
        </p>

        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            {t("reportCategoryLabel")}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUPPORT_CATEGORIES.map((value) => {
              const selected = category === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-field border p-2.5 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary/5 font-semibold text-ink"
                      : "border-line text-body hover:bg-surface-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="support-category"
                    value={value}
                    checked={selected}
                    onChange={() => setCategory(value)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  {t(`category.${value}`)}
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
            {t("reportMessageLabel")}
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
            rows={4}
            placeholder={t("reportMessagePlaceholder")}
            className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
          />
          <span className="mt-1 block text-end text-[11px] text-muted tabular-nums">
            {message.length}/{MAX_MESSAGE}
          </span>
        </label>

        <p className="mt-1 text-xs text-muted">{t("reportHint")}</p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" size="md" className="flex-1" onClick={close}>
            {t("cancel")}
          </Button>
          <Button
            size="md"
            className="flex-1"
            disabled={!ready || submitting}
            onClick={submit}
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("reportSubmit")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The button that opens it, plus the "you already told us" state.
 *
 * Sharing this rather than repeating the pattern on the tracker and in order
 * history: both places need the same rule — one live conversation per order, and a
 * link to it once there is one, because a second report about the same dinner is
 * the same conversation continued.
 */
export function ReportProblemButton({
  order,
  liveTicketId,
  size = "sm",
  className,
}: {
  order: Order;
  /** An open ticket about this order, when there is one. */
  liveTicketId: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const t = useTranslations("support");
  const [open, setOpen] = useState(false);

  if (liveTicketId) {
    return (
      <Button
        href={`/account/support/${liveTicketId}`}
        variant="outline"
        size={size}
        className={className}
      >
        {t("viewTicket")}
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size={size} className={className} onClick={() => setOpen(true)}>
        {t("reportProblem")}
      </Button>
      <ReportProblemDialog order={order} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
