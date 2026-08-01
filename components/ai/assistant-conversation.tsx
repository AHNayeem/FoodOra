"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { AssistantMessage } from "@/types";
import { useAssistant } from "@/stores/assistant";
import { STARTER_PROMPTS } from "@/lib/ai";
import { cn } from "@/lib/utils";
import { AssistantBlocks } from "./assistant-blocks";
import { resolveSayValues } from "./vocabulary";

/**
 * AssistantConversation — the thread, shared by the slide-over panel and the
 * `/ai` hub so the two are one assistant rather than two implementations.
 *
 * The assistant's turns are rendered from `say`/`notes` **keys**, not stored
 * prose, which is why switching the locale re-reads the whole conversation in
 * the new language. The customer's turns are their own words and are never
 * translated — the same rule review comments and vendor taglines follow.
 */
export function AssistantConversation({
  messages,
  thinking,
  onPrompt,
  className,
}: {
  messages: AssistantMessage[];
  thinking: boolean;
  onPrompt: (key: string) => void;
  className?: string;
}) {
  const t = useTranslations("ai");
  const entities = useAssistant((s) => s.entities);
  const avoid = useAssistant((s) => s.profile.allergies);
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the newest turn. `messages.length` rather than the array itself, so
  // a re-resolve of the entity cache does not yank the view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, thinking]);

  return (
    <div className={cn("min-w-0", className)}>
      {messages.length === 0 && !thinking && (
        <EmptyState onPrompt={onPrompt} />
      )}

      <ol className="space-y-5">
        {messages.map((message) => (
          <li key={message.id}>
            {message.role === "user" ? (
              <UserTurn message={message} />
            ) : (
              <AssistantTurn message={message} entities={entities} avoid={avoid} onPrompt={onPrompt} />
            )}
          </li>
        ))}
      </ol>

      {thinking && (
        <div className="mt-5 flex items-center gap-2" aria-live="polite">
          <Avatar />
          <span className="inline-flex items-center gap-1 rounded-panel rounded-ss-sm bg-surface-muted px-3.5 py-3">
            <span className="sr-only">{t("thinking")}</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1.5 animate-pulse rounded-pill bg-muted"
                style={{ animationDelay: `${i * 150}ms` }}
                aria-hidden
              />
            ))}
          </span>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

function Avatar() {
  return (
    <span
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-primary text-white"
      aria-hidden
    >
      <Sparkles className="size-4" />
    </span>
  );
}

function UserTurn({ message }: { message: AssistantMessage }) {
  const t = useTranslations("ai");
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-panel rounded-ee-sm bg-primary px-3.5 py-2.5 text-sm text-white">
        {/* A typed question is the customer's words; a tapped camera is not. */}
        {message.text ?? (message.say ? t(message.say.key, message.say.values) : "")}
      </p>
    </div>
  );
}

function AssistantTurn({
  message,
  entities,
  avoid,
  onPrompt,
}: {
  message: AssistantMessage;
  entities: React.ComponentProps<typeof AssistantBlocks>["entities"];
  avoid: React.ComponentProps<typeof AssistantBlocks>["avoid"];
  onPrompt: (key: string) => void;
}) {
  const t = useTranslations("ai");

  return (
    <div className="flex gap-2">
      <Avatar />
      <div className="min-w-0 flex-1">
        {message.say && (
          <p className="rounded-panel rounded-ss-sm bg-surface-muted px-3.5 py-2.5 text-sm text-ink">
            {t(message.say.key, resolveSayValues(message.say.values, t))}
          </p>
        )}

        {message.notes?.map((note, index) => (
          <p key={index} className="mt-1.5 px-1 text-xs text-muted">
            {t(note.key, resolveSayValues(note.values, t))}
          </p>
        ))}

        <AssistantBlocks blocks={message.blocks} entities={entities} avoid={avoid} />

        {message.chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {message.chips.map((key) => (
              <PromptChip key={key} promptKey={key} onPrompt={onPrompt} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A quick prompt. The label is localised; the sentence it sends is the fixed
 * English phrase in `lib/ai.PROMPTS`, because the parser reads English — the
 * chips are the localised path into an English-first parser (see `lib/ai`).
 */
export function PromptChip({
  promptKey,
  onPrompt,
}: {
  promptKey: string;
  onPrompt: (key: string) => void;
}) {
  const t = useTranslations("ai");
  return (
    <button
      type="button"
      onClick={() => onPrompt(promptKey)}
      className="rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-body transition-colors hover:border-primary hover:text-primary"
    >
      {t(`prompt.${promptKey}`)}
    </button>
  );
}

function EmptyState({ onPrompt }: { onPrompt: (key: string) => void }) {
  const t = useTranslations("ai");
  return (
    <div className="rounded-panel border border-dashed border-line px-4 py-6 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-pill bg-primary-50 text-primary">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <h3 className="mt-3 text-base font-semibold text-ink">{t("empty.heading")}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-body">{t("empty.body")}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {STARTER_PROMPTS.map((key) => (
          <PromptChip key={key} promptKey={key} onPrompt={onPrompt} />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">{t("empty.disclaimer")}</p>
    </div>
  );
}
