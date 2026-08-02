import { THEME_STORAGE_KEY } from "@/frontend/lib/theme-preference";

/**
 * ThemeScript — a tiny blocking script injected in <head> so the correct theme
 * class is present before first paint (no flash of wrong theme). Reads the
 * saved preference, falling back to the OS setting.
 *
 * Inlined by hand rather than importing `lib/theme-preference` at runtime: this
 * has to execute before any bundle loads. Only the storage key is shared, so the
 * two can't drift apart on the name.
 */
const script = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
