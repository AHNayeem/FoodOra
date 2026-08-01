"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Maximize2, Sparkles, Trash2, X } from "lucide-react";
import { useAssistant } from "@/stores/assistant";
import { AssistantConversation } from "./assistant-conversation";
import { AssistantComposer } from "./assistant-composer";
import { useAssistantChat } from "./use-assistant-chat";

/**
 * AssistantPanel — the assistant as a side sheet, reachable from anywhere on
 * the marketing site.
 *
 * Follows `CartDrawer` exactly (backdrop, Escape, scroll-lock, `animate-drawer-in`
 * which flips for RTL) rather than inventing a second overlay behaviour, so the
 * two sheets a customer meets on this site feel like one thing.
 *
 * The thread is *not* cleared on close. Closing a chat is putting it down, not
 * ending it — the store persists the turns and the panel reopens where it was.
 */
export function AssistantPanel() {
  const t = useTranslations("ai");
  const isOpen = useAssistant((s) => s.open);
  const close = useAssistant((s) => s.closePanel);
  const clear = useAssistant((s) => s.clear);
  const { messages, thinking, send, sendPrompt, scan } = useAssistantChat();

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[75]">
      <div
        className="animate-fade-in absolute inset-0 bg-ink/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="animate-drawer-in absolute inset-y-0 end-0 flex w-full max-w-md flex-col bg-surface-alt shadow-menu"
      >
        <header className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
          <span
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-primary text-white"
            aria-hidden
          >
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-ink">{t("title")}</h2>
            <p className="truncate text-xs text-muted">{t("subtitle")}</p>
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={clear}
              aria-label={t("clear")}
              className="inline-flex size-9 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
          <Link
            href="/ai"
            onClick={close}
            aria-label={t("openFull")}
            className="inline-flex size-9 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <Maximize2 className="size-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label={t("close")}
            className="inline-flex size-9 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <AssistantConversation messages={messages} thinking={thinking} onPrompt={sendPrompt} />
        </div>

        <div className="border-t border-line bg-surface p-3">
          <AssistantComposer onSend={send} onScan={scan} busy={thinking} autoFocus />
        </div>
      </aside>
    </div>
  );
}
