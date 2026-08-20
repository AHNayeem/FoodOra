"use client";

import { useTranslations } from "next-intl";
import type { DocumentStatus, OnboardingStatus } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Tone per application status.
 *
 * `pending` is warning-toned rather than neutral because it is the one status that
 * is somebody's *work* — a queue of grey rows does not read as a backlog. `inactive`
 * is deliberately neutral and not red: nobody did anything wrong.
 */
const STATUS_TONE: Record<OnboardingStatus, string> = {
  draft: "bg-surface-muted text-muted",
  pending: "bg-accent-50 text-accent-600",
  approved: "bg-fresh/10 text-fresh-600",
  rejected: "bg-danger/10 text-danger",
  suspended: "bg-danger/10 text-danger",
  inactive: "bg-surface-muted text-body",
};

/**
 * OnboardingStatusChip — one status, one chip, both queues (Phases 6–7).
 *
 * Shared between the restaurant and the rider surfaces on purpose: the statuses are
 * one union (`OnboardingStatus`), so two chips would be two chances for "suspended"
 * to be a different colour depending on which list you were looking at.
 */
export function OnboardingStatusChip({
  status,
  className,
}: {
  status: OnboardingStatus;
  className?: string;
}) {
  const t = useTranslations("onboarding");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-bold",
        STATUS_TONE[status],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}

const DOCUMENT_TONE: Record<DocumentStatus, string> = {
  missing: "bg-surface-muted text-muted",
  pending: "bg-accent-50 text-accent-600",
  verified: "bg-fresh/10 text-fresh-600",
  rejected: "bg-danger/10 text-danger",
  expired: "bg-danger/10 text-danger",
};

/** The same idea for a document's state. */
export function DocumentStatusChip({
  status,
  className,
}: {
  status: DocumentStatus;
  className?: string;
}) {
  const t = useTranslations("onboarding");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-bold",
        DOCUMENT_TONE[status],
        className,
      )}
    >
      {t(`documentStatus.${status}`)}
    </span>
  );
}
