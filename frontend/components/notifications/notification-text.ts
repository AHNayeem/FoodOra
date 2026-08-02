"use client";

import { useTranslations } from "next-intl";
import type { AppNotification, NotificationDispatch } from "@/types";

/** The two halves of a notification, however it stores them. */
export interface NotificationCopy {
  title: string;
  body: string;
}

/** What a row needs to render, whichever shape it arrived in. */
type Renderable = Pick<AppNotification, "audience" | "key" | "params" | "text">;

/**
 * Resolve a notification's words.
 *
 * There are exactly two shapes and this is the only place that knows it: a
 * platform message is a key plus params and reads in the current locale, and an
 * operator's broadcast is prose that was typed once and is rendered verbatim.
 * The alternative — translating a broadcast key with the operator's sentence as
 * a fallback — would let a Bangla catalogue silently rewrite what a human said.
 *
 * Returns a function rather than a string so a list can resolve many rows
 * against one `useTranslations` call.
 */
export function useNotificationCopy(): (item: Renderable) => NotificationCopy {
  const t = useTranslations("notifications");
  return (item) => {
    if (item.text) return item.text;
    return {
      title: t(`${item.audience}.${item.key}.title`, item.params),
      body: t(`${item.audience}.${item.key}.body`, item.params),
    };
  };
}

/** The same, for an outbox row — which stores the same two shapes. */
export function dispatchRenderable(dispatch: NotificationDispatch): Renderable {
  return {
    audience: dispatch.audience,
    key: dispatch.key,
    params: dispatch.params,
    text: dispatch.text,
  };
}
