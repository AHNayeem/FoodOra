"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/frontend/lib/utils";

/**
 * Modal — a lightweight accessible dialog: backdrop click + Escape to close,
 * body scroll-lock while open, focus moved into the panel on open. Consumers
 * supply the panel markup/width via `className`; the shell handles behaviour.
 * Renders a bottom-sheet on mobile, a centered card from `sm` up.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape reads the handler through a ref so the setup effect below can depend
  // on `open` alone. Consumers pass an inline `onClose`, so keeping it in the
  // deps would re-run the effect on every parent render — and re-running it
  // means another `panelRef.focus()`, which yanks the caret out of whatever the
  // user was typing in (the OTP cells, most visibly) on each tick of a clock.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div
        className="animate-fade-in absolute inset-0 bg-ink/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          "animate-pop-in relative max-h-[90dvh] w-full overflow-y-auto bg-surface shadow-menu outline-none",
          "rounded-t-panel sm:max-w-md sm:rounded-panel",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
