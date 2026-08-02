import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "accent" | "fresh" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-body border border-line",
  primary: "bg-primary-50 text-primary-700 dark:text-primary",
  accent: "bg-accent-50 text-accent-600",
  fresh: "bg-fresh-50 text-fresh-600",
  danger: "bg-danger/10 text-danger",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
