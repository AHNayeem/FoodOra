"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the settings page (Phase C28). Every section is the
 * same panel with the same row rhythm, so the parts live here instead of being
 * re-styled per section.
 */

/** A titled settings panel. */
export function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * SwitchRow — a labelled on/off setting.
 *
 * A `role="switch"` button rather than a styled checkbox: the knob is a child of
 * the track, so `peer-checked:` variants can't reach it, and driving both from
 * `checked` in one place keeps the two halves from disagreeing.
 */
export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  lockedHint,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Explains why the control can't be changed, when disabled. */
  lockedHint?: string;
}) {
  const labelId = useId();
  const hintId = useId();

  return (
    <div className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-semibold text-ink">
          {label}
        </p>
        {description && (
          <p id={hintId} className="mt-0.5 text-sm text-muted">
            {description}
          </p>
        )}
        {disabled && lockedHint && (
          <p className="mt-1 text-xs font-medium text-muted">{lockedHint}</p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? hintId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          checked ? "bg-primary" : "bg-line",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-5 rounded-pill bg-surface shadow-sm transition-transform",
            checked ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5 rtl:-translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/** Divided stack of rows inside a section. */
export function RowGroup({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>;
}
