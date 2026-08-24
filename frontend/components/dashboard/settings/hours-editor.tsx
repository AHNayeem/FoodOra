"use client";

import { useTranslations } from "next-intl";
import type { WeeklyHours } from "@/types";
import { WEEK, isOpenDay } from "@/lib/vendor-settings";
import { Input } from "@/components/ui/input";

/**
 * HoursEditor — a week of trading hours (Phase 10, G18).
 *
 * Shared by the settings page and the branch dialog, because a branch's rota is the
 * same kind of thing as the restaurant's and an editor written twice is an editor
 * where one copy forgets the closed switch.
 *
 * Two decisions worth stating:
 *
 *  - **"Closed" is a checkbox, not an empty field.** `DayHours` says closed by
 *    holding nulls, so clearing both inputs would technically work — but a row that
 *    looks blank is indistinguishable from a row somebody has not filled in yet,
 *    and the difference decides whether the storefront says "open" all night.
 *  - **Overnight service is allowed.** 18:00–02:00 is the normal case for half this
 *    catalog, so the validator in `lib/vendor-settings.hoursErrors` checks
 *    parsability and not `open < close`. Nothing here refuses it either.
 *
 * `<input type="time">` is native on purpose: it is keyboard-operable, the platform
 * localises the 12/24-hour presentation, and a phone gives it a spinner.
 */
export function HoursEditor({
  hours,
  errors = {},
  disabled = false,
  onChange,
}: {
  hours: WeeklyHours;
  /** Per-day errors keyed by weekday, from `hoursErrors`. */
  errors?: Record<string, string>;
  disabled?: boolean;
  onChange: (next: WeeklyHours) => void;
}) {
  const t = useTranslations("vendorSettings");
  const tDays = useTranslations("days");

  function setDay(day: (typeof WEEK)[number], patch: Partial<WeeklyHours[typeof day]>) {
    onChange({ ...hours, [day]: { ...hours[day], ...patch } });
  }

  return (
    <div className="space-y-2">
      {WEEK.map((day) => {
        const entry = hours[day];
        const open = isOpenDay(entry);
        const error = errors[day];
        return (
          <div
            key={day}
            className="flex flex-wrap items-center gap-2 rounded-field border border-line bg-surface p-2.5"
          >
            <span className="w-16 shrink-0 text-sm font-semibold text-ink">
              {tDays(day)}
            </span>

            <Input
              type="time"
              aria-label={t("hours.openAt", { day: tDays(day) })}
              aria-invalid={Boolean(error)}
              disabled={disabled || !open}
              value={entry.open ?? ""}
              onChange={(e) => setDay(day, { open: e.target.value || null })}
              className="w-32"
            />
            <span className="text-muted" aria-hidden>
              –
            </span>
            <Input
              type="time"
              aria-label={t("hours.closeAt", { day: tDays(day) })}
              aria-invalid={Boolean(error)}
              disabled={disabled || !open}
              value={entry.close ?? ""}
              onChange={(e) => setDay(day, { close: e.target.value || null })}
              className="w-32"
            />

            <label className="ms-auto flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted">
              <input
                type="checkbox"
                checked={!open}
                disabled={disabled}
                onChange={(e) =>
                  // Closing keeps nothing; reopening seeds a plausible day rather
                  // than two empty fields the validator would then refuse.
                  setDay(
                    day,
                    e.target.checked
                      ? { open: null, close: null }
                      : { open: "10:00", close: "22:00" },
                  )
                }
                className="size-4 accent-primary"
              />
              {t("hours.closed")}
            </label>

            {error && (
              <p role="alert" className="w-full text-xs font-medium text-danger">
                {t(error)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
