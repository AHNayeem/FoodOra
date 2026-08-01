"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { applyThemePreference, subscribeToThemePreference } from "@/lib/theme-preference";
import { cn } from "@/lib/utils";

/** Subscribe to `.dark` changes on <html>, so the icon tracks the real theme. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  // Also catch preference writes from another tab, which flip the class here too.
  const unsubscribe = subscribeToThemePreference(onChange);
  return () => {
    observer.disconnect();
    unsubscribe();
  };
}

const isDark = () => document.documentElement.classList.contains("dark");

/**
 * ThemeToggle — the header's light/dark switch. Writes an explicit preference
 * through `lib/theme-preference` (the settings page owns the three-way choice
 * including "system", Phase C28).
 *
 * The class on <html> is the source of truth, read through
 * `useSyncExternalStore` rather than mirrored into state in an effect: the
 * server snapshot is `false` (matching ThemeScript's pre-hydration default of
 * no class on the server), and any change to the class — from this button or
 * anywhere else — re-renders the icon.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  return (
    <button
      type="button"
      onClick={() => applyThemePreference(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-pill text-ink transition-colors hover:bg-surface-muted lg:size-10",
        className,
      )}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}
