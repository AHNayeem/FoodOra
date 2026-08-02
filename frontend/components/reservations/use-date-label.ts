"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addDays, fromDateKey, toDateKey } from "@/frontend/lib/dates";

/**
 * Formats a plain "YYYY-MM-DD" key for display, saying "Today"/"Tomorrow" where
 * that is what a person would say. Shared by every reservation surface so a
 * date reads the same on a card, in the booking form and on the venue's book.
 *
 * `now` is passed in by the caller — the same clock the surrounding surface is
 * deriving its availability from, never a fresh `new Date()` per render.
 */
export function useDateLabel(now: Date) {
  const locale = useLocale();
  const t = useTranslations("reservations");

  return useCallback(
    (key: string, { relative = true }: { relative?: boolean } = {}) => {
      if (relative) {
        if (key === toDateKey(now)) return t("today");
        if (key === toDateKey(addDays(now, 1))) return t("tomorrow");
      }
      return fromDateKey(key).toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    },
    [locale, now, t],
  );
}
