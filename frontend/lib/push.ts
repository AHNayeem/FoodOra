/**
 * push.ts — browser notifications, for real (Phase C25).
 *
 * The spec asks for "Push Notification" and the honest way to build that in a
 * frontend-only prototype is the same choice C24 made about voice search: use
 * the capability the browser actually has, and be plain about the half we do
 * not.
 *
 * **What is real.** `window.Notification` is the platform API. Permission is
 * requested from a user gesture, the grant is the browser's (not ours, and not
 * something a store can fake), and a granted notification is drawn by the
 * operating system outside the page.
 *
 * **What is not.** There is no service worker, no VAPID key and no push
 * service, which means nothing arrives while the tab is closed — a real
 * deployment adds a `ServiceWorkerRegistration.showNotification` and a
 * subscription posted to the backend, and the call sites here do not change.
 * The UI says this rather than implying a delivery it cannot make.
 *
 * Everything is feature-detected: Safari on iOS below 16.4, an insecure origin
 * and a privacy-hardened profile all report "unsupported", and the surface
 * hides the control instead of offering a button that cannot work.
 */

export type PushPermission = "unsupported" | "default" | "granted" | "denied";

/** Is the API present at all? False during SSR, so callers must render on the client. */
export function pushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function pushPermission(): PushPermission {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as Exclude<PushPermission, "unsupported">;
}

/**
 * Ask for permission. Must be called from a user gesture — browsers ignore (or
 * auto-deny) a request made on load, which is why no surface here asks on mount.
 */
export async function requestPush(): Promise<PushPermission> {
  if (!pushSupported()) return "unsupported";
  try {
    return (await Notification.requestPermission()) as Exclude<PushPermission, "unsupported">;
  } catch {
    // Older Safari resolves the callback form only; treat a throw as no change.
    return pushPermission();
  }
}

export interface PushPayload {
  title: string;
  body: string;
  /** Collapse key — a second update about the same order replaces the first. */
  tag: string;
  /** Opened when the notification is clicked. */
  href: string;
}

/**
 * Draw one, if we are allowed to and the page is not already showing it.
 *
 * The visibility check is the rule that keeps this from being annoying: a
 * customer watching the live tracker does not need the operating system to tell
 * them what is on their screen. Push is for the tab they left.
 *
 * Returns whether the notification was actually drawn, so the outbox can record
 * the truth rather than the intent.
 */
export function showPush(payload: PushPayload): boolean {
  if (pushPermission() !== "granted") return false;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return false;

  try {
    const notification = new Notification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icon.svg",
      badge: "/icon.svg",
    });
    notification.onclick = () => {
      window.focus();
      window.location.href = payload.href;
      notification.close();
    };
    return true;
  } catch {
    // Some browsers throw for the constructor form and require a service
    // worker. Nothing to fall back to here, and nothing to report as sent.
    return false;
  }
}
