"use client";

import { useTranslations } from "next-intl";
import type { CmsStatus } from "@/types";
import { cn } from "@/lib/utils";

const TONE: Record<CmsStatus, string> = {
  published: "bg-success/10 text-success",
  draft: "bg-warning/15 text-warning",
  scheduled: "bg-primary/10 text-primary",
  expired: "bg-surface-muted text-muted",
  archived: "bg-danger/10 text-danger",
};

/** The one way a publication state is drawn, in every CMS surface. */
export function StatusChip({ status, className }: { status: CmsStatus; className?: string }) {
  const t = useTranslations("cms");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 text-xs font-bold",
        TONE[status],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}

/** "3 unpublished changes" is a second axis, so it gets its own chip. */
export function DraftChip({ className }: { className?: string }) {
  const t = useTranslations("cms");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-pill bg-warning/15 px-2.5 py-0.5 text-xs font-bold text-warning",
        className,
      )}
    >
      {t("draftPending")}
    </span>
  );
}
