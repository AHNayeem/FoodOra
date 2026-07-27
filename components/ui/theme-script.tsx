/**
 * ThemeScript — a tiny blocking script injected in <head> so the correct theme
 * class is present before first paint (no flash of wrong theme). Reads the
 * saved preference, falling back to the OS setting.
 */
const script = `(function(){try{var t=localStorage.getItem('foodora-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
