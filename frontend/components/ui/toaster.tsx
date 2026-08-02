"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Toaster — global toast host (mounted once in the root layout). Simulated
 * notifications (order updates, coupons applied, etc.) fire through sonner.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        style: {
          background: "var(--color-surface)",
          color: "var(--color-ink)",
          border: "1px solid var(--color-line)",
          borderRadius: "var(--radius-card)",
        },
      }}
    />
  );
}
