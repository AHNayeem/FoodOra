"use client";

import { useTranslations } from "next-intl";
import type { SettlementStatus } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Tone per settlement status.
 *
 * `open` is neutral because nothing is owed yet — the week is still running, and
 * colouring it would read as a problem. `pending` is the one status that is
 * somebody's *work* (money owed and not sent), so it carries the accent the
 * onboarding queue gives `pending` for the same reason. `paid` is green because it
 * is finished, and `processing` sits between the two.
 */
const TONE: Record<SettlementStatus, string> = {
  open: "bg-surface-muted text-muted",
  pending: "bg-accent-50 text-accent-600",
  processing: "bg-primary/10 text-primary",
  paid: "bg-fresh/10 text-fresh-600",
};

/**
 * SettlementStatusChip — one status, one chip, every financial surface (Phase 8).
 *
 * Shared between the restaurant's earnings page and the admin's payout run on
 * purpose: `SettlementStatus` is one union covering both payees, so two chips would
 * be two chances for "pending" to mean something different depending on which side
 * of the transfer you were looking at.
 */
export function SettlementStatusChip({
  status,
  className,
}: {
  status: SettlementStatus;
  className?: string;
}) {
  const t = useTranslations("finance");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-bold",
        TONE[status],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
