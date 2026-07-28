"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * QuantityStepper — reusable −/＋ control. When `value` is at `min` and
 * `removable` is set, the minus button becomes a delete affordance (used in the
 * cart drawer where dropping below 1 removes the line).
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  removable = false,
  decrementLabel,
  incrementLabel,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  removable?: boolean;
  decrementLabel: string;
  incrementLabel: string;
  className?: string;
}) {
  const atMin = value <= min;
  const showTrash = removable && atMin;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border border-line bg-surface p-1",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={atMin && !removable}
        aria-label={decrementLabel}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-pill transition-colors disabled:opacity-40",
          showTrash ? "text-danger hover:bg-danger/10" : "text-ink hover:bg-surface-muted",
        )}
      >
        {showTrash ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
      </button>
      <span className="min-w-6 text-center text-sm font-bold tabular-nums text-ink">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={incrementLabel}
        className="inline-flex size-8 items-center justify-center rounded-pill text-ink transition-colors hover:bg-surface-muted disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
