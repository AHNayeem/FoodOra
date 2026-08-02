"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Trash2 } from "lucide-react";
import { useAssistant } from "@/frontend/stores/assistant";
import { useSettings } from "@/frontend/stores/settings";
import { AssistantConversation } from "./assistant-conversation";
import { AssistantComposer } from "./assistant-composer";
import { DietPlanner } from "./diet-planner";
import { FoodProfileForm } from "./food-profile-form";
import { useAssistantChat } from "./use-assistant-chat";

/**
 * AssistantHub — the assistant with room to work (`/ai`).
 *
 * The same conversation as the slide-over, restored from the same store, beside
 * the two things a 24rem sheet cannot hold: the food profile in full, and the
 * diet planner with a week of days on screen at once. Ask a question in the
 * panel, open the hub, and the thread is already there — one assistant, two
 * places to stand.
 */
export function AssistantHub() {
  const t = useTranslations("ai");
  const clear = useAssistant((s) => s.clear);
  const { messages, thinking, send, sendPrompt, scan } = useAssistantChat();

  // The hub can be the first thing a visitor opens, so it rehydrates the same
  // two stores the global mount does rather than assuming it ran first.
  useEffect(() => {
    useAssistant.persist.rehydrate();
    useSettings.persist.rehydrate();
  }, []);

  return (
    <div className="container-site py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="inline-flex items-center gap-2.5 text-h1 text-ink">
            <span
              className="inline-flex size-10 items-center justify-center rounded-pill bg-primary text-white"
              aria-hidden
            >
              <Sparkles className="size-5" />
            </span>
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-body">{t("hub.intro")}</p>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-body transition-colors hover:border-primary hover:text-primary"
          >
            <Trash2 className="size-4" aria-hidden />
            {t("clear")}
          </button>
        )}
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <div className="flex min-h-[26rem] flex-col rounded-panel border border-line bg-surface-alt p-4 sm:p-5">
            <div className="flex-1">
              <AssistantConversation
                messages={messages}
                thinking={thinking}
                onPrompt={sendPrompt}
              />
            </div>
            <AssistantComposer
              onSend={send}
              onScan={scan}
              busy={thinking}
              className="mt-5 bg-surface"
            />
          </div>

          <div className="mt-6">
            <DietPlanner />
          </div>
        </div>

        <aside className="min-w-0 space-y-6">
          <FoodProfileForm />

          <section className="rounded-panel border border-line bg-surface-muted p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink">{t("hub.honestHeading")}</h2>
            <ul className="mt-2 space-y-2 text-sm text-body">
              <li>{t("hub.honestNoModel")}</li>
              <li>{t("hub.honestEstimates")}</li>
              <li>{t("hub.honestVoice")}</li>
              <li>{t("hub.honestPrivacy")}</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
