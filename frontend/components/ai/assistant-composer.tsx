"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { MAX_INPUT_LENGTH } from "@/frontend/lib/ai";
import type { ImageFingerprint } from "@/frontend/services/ai";
import { cn } from "@/frontend/lib/utils";
import { VoiceButton } from "./voice-button";
import { ImageScanButton } from "./image-scan-button";

/**
 * AssistantComposer — the input line: type, dictate (C24 Voice Search) or
 * photograph (Image Search / OCR).
 *
 * The textarea grows with the question up to a ceiling, because "something
 * light and halal under 500 that isn't fried" does not fit on one line and a
 * customer who cannot see what they typed edits it badly. Enter sends; Shift+Enter
 * breaks the line — the convention every chat input has trained people on.
 */
export function AssistantComposer({
  onSend,
  onScan,
  busy,
  autoFocus = false,
  className,
}: {
  onSend: (text: string) => void;
  onScan: (file: ImageFingerprint, mode: "dish" | "menu") => void;
  busy: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const t = useTranslations("ai");
  const [value, setValue] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    setValue("");
    if (field.current) {
      field.current.style.height = "auto";
      field.current.focus();
    }
    onSend(text);
  }

  /** Dictation fills the box rather than sending — speech mishears (see VoiceButton). */
  function dictated(text: string) {
    setValue((current) => (current ? `${current} ${text}` : text).slice(0, MAX_INPUT_LENGTH));
    const el = field.current;
    if (el) {
      el.focus();
      requestAnimationFrame(() => grow(el));
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        "flex items-end gap-1 rounded-panel border border-line bg-surface p-1.5",
        className,
      )}
    >
      <ImageScanButton onScan={onScan} disabled={busy} />

      <label htmlFor="assistant-input" className="sr-only">
        {t("composer.label")}
      </label>
      <textarea
        id="assistant-input"
        ref={field}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        maxLength={MAX_INPUT_LENGTH}
        placeholder={t("composer.placeholder")}
        onChange={(e) => {
          setValue(e.target.value);
          grow(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-ink outline-none placeholder:text-muted"
      />

      <VoiceButton onTranscript={dictated} />

      <button
        type="submit"
        disabled={busy || !value.trim()}
        aria-label={t("composer.send")}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-primary text-white transition-[background,transform] hover:bg-primary-600 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
      >
        <Send className="size-4 rtl:-scale-x-100" aria-hidden />
      </button>
    </form>
  );
}
