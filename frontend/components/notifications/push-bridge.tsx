"use client";

import { useEffect, useRef } from "react";
import { useNotifications } from "@/frontend/stores/notifications";
import { showPush } from "@/frontend/lib/push";
import { useNotificationCopy } from "./notification-text";

/**
 * PushBridge — draws the browser notification for anything the gate let through
 * on the `push` channel (Phase C25). Mounted once in the root layout, renders
 * nothing.
 *
 * It lives in the React tree rather than in the store because a notification is
 * a key plus params and only a tree holding the message catalog can turn that
 * into the sentence an operating system banner needs. The store already made the
 * *decision* — `channels` includes `push` or it does not — so this component
 * has no policy in it at all, which is the point: there is still exactly one
 * place a preference is consulted.
 *
 * `showPush` declines while the tab is visible, so this only ever fires for the
 * tab someone walked away from. The `shown` set is local, not persisted: a
 * duplicate banner after a reload is a smaller sin than persisting bookkeeping
 * that has no meaning outside this tab (the `DemoEngine` precedent).
 */
export function PushBridge() {
  const copy = useNotificationCopy();
  const shown = useRef<Set<string>>(new Set());
  // Held in a ref so the subscription below is set up exactly once and still
  // calls the *current* translator — a locale switch must change the words in
  // the banner without tearing down and rebuilding the subscription.
  const copyRef = useRef(copy);
  useEffect(() => {
    copyRef.current = copy;
  });

  useEffect(() => {
    // Anything older than this mount is history, not news. Checking the *time*
    // rather than seeding from the current items matters because the store
    // rehydrates from localStorage after this runs — without it, reopening the
    // app would fire a banner for every notification of the past week.
    const since = Date.now();

    return useNotifications.subscribe((state) => {
      if (!state.pushOptIn) return;
      for (const item of state.items) {
        if (shown.current.has(item.id)) continue;
        shown.current.add(item.id);
        if (!item.channels.includes("push")) continue;
        if (Date.parse(item.at) < since) continue;
        const { title, body } = copyRef.current(item);
        showPush({
          title,
          body,
          tag: item.subject?.id ?? item.id,
          href: item.href,
        });
      }
    });
  }, []);

  return null;
}
