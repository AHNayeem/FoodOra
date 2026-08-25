/**
 * store-sync.ts — keeping the surfaces consistent across windows (Phase 18, G42).
 *
 * "One source of truth" in this prototype means one `localStorage` key that all
 * four surfaces read and write. That is true, and it was only half of what the
 * store's own documentation claimed: accepting an order in the dashboard tab did
 * *not* change the customer's tracker in the tab beside it, because a persisted
 * zustand store reads its key once, on hydration, and never looks again. The two
 * tabs shared a key and diverged the moment either wrote to it — so a reviewer
 * running the demo the way it is meant to be run, one surface per window, watched
 * two unrelated worlds and had to reload to reconcile them.
 *
 * A `storage` event fires in *other* same-origin windows whenever a key changes,
 * which is exactly the signal needed and exactly the one nobody was listening to.
 * Rehydrating on it makes the claim true.
 *
 * What this deliberately does not attempt is the other half of G42 — two
 * machines, or two browser profiles, which have separate storage and cannot be
 * reconciled without the transport the prototype is specified not to have (§2).
 * That needs the real API, and it is the one thing here that Phase E deletes
 * rather than replaces: a server-backed store gets its updates from the server.
 */

/**
 * Registered keys. Guarded because Next's fast refresh re-evaluates a store
 * module without unloading the window, and a listener per edit would rehydrate
 * once per edit.
 */
const attached = new Set<string>();

/**
 * Rehydrate `rehydrate` whenever another window writes `key`.
 *
 * Called at module scope by each store that more than one surface reads, right
 * after the store is created. Not inside `onRehydrateStorage`, because the point
 * is to be listening before this window's own first hydration finishes — a
 * dashboard opened while the customer is checking out has to catch the write it
 * missed.
 *
 * The listener compares against the last value it saw and skips a repeat. That
 * matters because a rehydration is itself a state change, so it writes the value
 * straight back and the other window sees an event for it: without the guard the
 * two windows would hand the same payload back and forth. With it, the echo stops
 * at the first bounce.
 */
export function syncAcrossWindows(key: string, rehydrate: () => void): void {
  if (typeof window === "undefined" || attached.has(key)) return;
  attached.add(key);

  let lastSeen: string | null = null;
  window.addEventListener("storage", (event) => {
    if (event.key !== key) return;
    // A cleared key is somebody resetting the demo, not a state to adopt: the
    // store's own seed decides what an empty device holds.
    if (event.newValue === null || event.newValue === lastSeen) return;
    lastSeen = event.newValue;
    rehydrate();
  });
}
