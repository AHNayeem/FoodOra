import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/frontend/lib/utils";

/**
 * StatCard — a single KPI tile on the dashboard overview. Shows a label, a
 * value and (optionally) a signed delta vs the prior period, colour-coded.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaLabel,
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Signed fraction vs the prior period; omit to hide the trend chip. */
  delta?: number;
  /** Accessible/visible text for the delta, e.g. "+12% vs yesterday". */
  deltaLabel?: string;
  /** Small muted line under the value (used when there's no delta). */
  hint?: string;
}) {
  const up = (delta ?? 0) >= 0;

  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{label}</span>
        <span className="inline-flex size-9 items-center justify-center rounded-field bg-primary/10 text-primary">
          <Icon className="size-4.5" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-2xl font-extrabold tracking-tight text-ink">{value}</p>
      {deltaLabel != null && delta != null ? (
        <p
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 text-xs font-semibold",
            up ? "text-fresh-600" : "text-danger",
          )}
        >
          {up ? (
            <ArrowUpRight className="size-3.5" aria-hidden />
          ) : (
            <ArrowDownRight className="size-3.5" aria-hidden />
          )}
          {deltaLabel}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
