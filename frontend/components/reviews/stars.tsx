"use client";

import { useId, useState } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/frontend/lib/utils";
import { STAR_VALUES } from "@/frontend/lib/reviews";

/**
 * stars.tsx — the two star widgets every review surface uses (Phase C22).
 *
 * `Stars` displays a score, including a fractional one: a 4.6 average draws
 * four and a bit, because rounding it to five would overstate the restaurant on
 * the one number customers look at hardest. `StarInput` collects a score, and is
 * built on real radio inputs so it arrives keyboard-operable and announced
 * correctly rather than needing a pile of ARIA to fake it.
 */

const SIZES = {
  sm: "size-3.5",
  md: "size-4.5",
  lg: "size-6",
  xl: "size-8",
} as const;

export function Stars({
  value,
  size = "md",
  className,
  label,
}: {
  /** 0–5, fractions allowed. */
  value: number;
  size?: keyof typeof SIZES;
  className?: string;
  /** Accessible text; omit inside a labelled block that already says the score. */
  label?: string;
}) {
  const clamped = Math.min(5, Math.max(0, value));
  // The filled row is drawn over the empty one and clipped to the score. Doing
  // it with a width rather than per-star maths keeps a 4.6 honest at any size.
  const width = `${(clamped / 5) * 100}%`;

  return (
    <span
      className={cn("relative inline-flex shrink-0 align-middle", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="flex gap-0.5">
        {STAR_VALUES.map((star) => (
          <Star key={star} className={cn(SIZES[size], "text-line")} />
        ))}
      </span>
      {/* LTR-pinned: stars fill left-to-right in every locale, the way a
          progress bar of a numeric score does. */}
      <span
        className="absolute inset-y-0 start-0 overflow-hidden"
        style={{ width, direction: "ltr" }}
      >
        <span className="flex gap-0.5">
          {STAR_VALUES.map((star) => (
            <Star key={star} className={cn(SIZES[size], "fill-rating text-rating")} />
          ))}
        </span>
      </span>
    </span>
  );
}

/**
 * The star picker. Radios under the hood: arrow keys move between them, the
 * whole group is one tab stop, and each option announces the score it sets.
 */
export function StarInput({
  value,
  onChange,
  name,
  label,
  size = "lg",
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  /** Unique within the form — two pickers on one page must not share a group. */
  name?: string;
  label: string;
  size?: keyof typeof SIZES;
  disabled?: boolean;
}) {
  const t = useTranslations("reviews");
  const fallbackName = useId();
  const group = name ?? fallbackName;
  // Hover previews the score without committing it — the affordance that makes
  // a star picker feel like one.
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? value;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-1"
      onMouseLeave={() => setPreview(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <label
          key={star}
          className={cn(
            "cursor-pointer p-0.5 transition-transform",
            disabled ? "cursor-not-allowed opacity-60" : "hover:scale-110",
          )}
          onMouseEnter={() => !disabled && setPreview(star)}
        >
          <input
            type="radio"
            name={group}
            value={star}
            checked={value === star}
            disabled={disabled}
            onChange={() => onChange(star)}
            onFocus={() => setPreview(star)}
            onBlur={() => setPreview(null)}
            className="peer sr-only"
          />
          <Star
            aria-hidden
            className={cn(
              SIZES[size],
              "transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 rounded-sm",
              star <= shown ? "fill-rating text-rating" : "text-line",
            )}
          />
          <span className="sr-only">{t("starsCount", { count: star })}</span>
        </label>
      ))}
    </div>
  );
}
