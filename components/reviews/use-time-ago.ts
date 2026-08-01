"use client";

import { useCallback } from "react";
import { useLocale } from "next-intl";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "3 days ago" in the reader's language, from a clock the caller owns.
 *
 * `now` is passed in — always the instant `services/reviews` stamped the read
 * with — so every card in a list is measured against one reading rather than
 * each calling `Date.now()` on its own render.
 *
 * Falls back to an absolute date beyond a month: "47 days ago" is a number
 * nobody converts, while "12 Mar" is a date everybody reads.
 */
export function useTimeAgo(now: number) {
  const locale = useLocale();

  return useCallback(
    (iso: string) => {
      const then = Date.parse(iso);
      if (!Number.isFinite(then)) return "";
      const diff = then - now;
      const abs = Math.abs(diff);
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

      if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), "minute");
      if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
      if (abs < 30 * DAY) return rtf.format(Math.round(diff / DAY), "day");

      return new Date(then).toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        year: new Date(then).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
      });
    },
    [locale, now],
  );
}
