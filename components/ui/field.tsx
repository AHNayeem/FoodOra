import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Field — labels a form control and renders its validation error, wiring the
 * `id`/`htmlFor`/`aria-describedby` relationships once so every form gets
 * accessible fields for free. The control is passed as a render prop so the
 * caller keeps full control of the input (register(), aria-invalid, etc.).
 */
interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: (ids: { id: string; describedBy?: string }) => React.ReactNode;
}

export function Field({ id, label, error, hint, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {children({ id, describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
