"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAssistant } from "@/stores/assistant";
import {
  ask,
  blockIds,
  promptText,
  recogniseImage,
  recommend,
  resolveEntities,
  userAction,
  userMessage,
  type ImageFingerprint,
} from "@/services/ai";
import { useAssistantContext } from "./use-assistant-context";

/**
 * The conversation's behaviour, in one hook so the slide-over panel and the
 * full-page hub are the same assistant rather than two that drift.
 *
 * Three jobs:
 *
 *  1. **Send.** Push the customer's turn immediately (a chat that waits for the
 *     server to echo your own words feels broken), then await the seam, then
 *     push the reply and absorb the entities it embedded.
 *  2. **Rehydrate.** A thread restored from localStorage holds ids and nothing
 *     else; this re-resolves them once on mount, which is why yesterday's
 *     answer shows today's prices.
 *  3. **Refuse politely.** The seam's error keys are shown as toasts, not as
 *     assistant turns — the assistant did not *say* the message was too long,
 *     the app did.
 */
export function useAssistantChat() {
  const t = useTranslations("ai");
  const ctx = useAssistantContext();
  const messages = useAssistant((s) => s.messages);
  const thinking = useAssistant((s) => s.thinking);
  const hydrated = useAssistant((s) => s.hydrated);
  const push = useAssistant((s) => s.push);
  const absorb = useAssistant((s) => s.absorb);
  const setThinking = useAssistant((s) => s.setThinking);

  // Guards a double-send from an Enter key that fires while a reply is in
  // flight; the store flag drives the UI, this drives the logic.
  const busy = useRef(false);

  // Re-resolve every id the restored thread refers to, once, after hydration.
  const resolved = useRef(false);
  useEffect(() => {
    if (!hydrated || resolved.current) return;
    resolved.current = true;
    const ids = blockIds(messages.flatMap((m) => m.blocks));
    if (!ids.foodIds.length && !ids.vendorIds.length) return;
    let live = true;
    void resolveEntities(ids).then((entities) => {
      if (live) absorb(entities);
    });
    return () => {
      live = false;
    };
  }, [hydrated, messages, absorb]);

  const send = useCallback(
    async (text: string) => {
      const input = text.trim();
      if (!input || busy.current) return;
      busy.current = true;
      push(userMessage(input));
      setThinking(true);
      try {
        const res = await ask(input, ctx);
        if (!res.data) {
          toast.error(t(res.error));
          return;
        }
        push(res.data.message);
        absorb(res.data.entities);
      } finally {
        setThinking(false);
        busy.current = false;
      }
    },
    [ctx, push, absorb, setThinking, t],
  );

  /** A quick chip: the label is localised, the sentence it sends is not. */
  const sendPrompt = useCallback((key: string) => send(promptText(key)), [send]);

  /** The opening recommendation, used when a thread starts empty. */
  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setThinking(true);
    try {
      const reply = await recommend(ctx);
      push(reply.message);
      absorb(reply.entities);
    } finally {
      setThinking(false);
      busy.current = false;
    }
  }, [ctx, push, absorb, setThinking]);

  /** Image search / food recognition / menu scan — all one door (spec C24). */
  const scan = useCallback(
    async (file: ImageFingerprint, mode: "dish" | "menu") => {
      if (busy.current) return;
      busy.current = true;
      push(userAction(mode === "menu" ? "scan.sentMenu" : "scan.sentDish"));
      setThinking(true);
      try {
        const res = await recogniseImage(file, mode, ctx);
        if (!res.data) {
          toast.error(t(res.error));
          return;
        }
        push(res.data.message);
        absorb(res.data.entities);
      } finally {
        setThinking(false);
        busy.current = false;
      }
    },
    [ctx, push, absorb, setThinking, t],
  );

  return { messages, thinking, hydrated, send, sendPrompt, start, scan };
}
