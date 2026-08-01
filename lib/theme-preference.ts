/**
 * theme-preference.ts — the one owner of the light/dark *preference* contract
 * (Phases C30 / C28). Design tokens live in `lib/theme.ts`; this is only about
 * which mode is active.
 *
 * The `.dark` class on <html> is the source of truth for what is *rendered*;
 * localStorage holds the *preference*. An absent key means "follow the OS",
 * which is why the preference is three-way while the class is a boolean:
 *
 *   system → key removed, class follows `prefers-color-scheme`
 *   light  → key "light", class off
 *   dark   → key "dark",  class on
 *
 * ThemeScript applies this pre-paint, ThemeToggle flips it, and the settings
 * page (C28) exposes all three choices. Writers dispatch {@link THEME_EVENT} so
 * any control showing the *preference* can re-read it — a class observer isn't
 * enough, because switching between "system" and an explicit choice that happens
 * to match the OS changes the preference without changing the class.
 */

export const THEME_STORAGE_KEY = "foodora-theme";

/** Same-tab notification that the stored preference changed. */
export const THEME_EVENT = "foodora:theme";

export type ThemePreference = "system" | "light" | "dark";

/** The saved preference, or "system" when nothing is stored (or storage is blocked). */
export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : "system";
  } catch {
    return "system";
  }
}

/** Whether the OS currently asks for a dark UI. */
export function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Store a preference, apply it to <html>, and notify same-tab listeners. */
export function applyThemePreference(preference: ThemePreference): void {
  const dark = preference === "system" ? prefersDark() : preference === "dark";
  document.documentElement.classList.toggle("dark", dark);
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* storage blocked — the theme still applies for this session */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Subscribe to preference changes (this tab via THEME_EVENT, others via storage). */
export function subscribeToThemePreference(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
