"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * VoiceButton — dictation for the composer (spec: Voice Search).
 *
 * **This one is not simulated.** The Web Speech API is in the browser already,
 * so voice search is the single AI feature in this phase that is genuinely
 * real: the microphone is the device's, the transcript is the device's, and
 * nothing is uploaded anywhere. Where the browser has no support (Firefox, and
 * every browser with the permission denied) the button hides itself rather than
 * offering something that will not work.
 *
 * The transcript is dropped into the composer instead of sent, because speech
 * recognition mishears and a wrong question sent automatically is a worse
 * experience than one the customer can fix before pressing send.
 */

/** The slice of the (still non-standard) API we use, declared locally. */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** App locale → a BCP-47 tag the speech engine recognises. */
const SPEECH_LOCALES: Record<string, string> = {
  en: "en-US",
  bn: "bn-BD",
  ar: "ar-SA",
};

export function VoiceButton({
  onTranscript,
  className,
}: {
  onTranscript: (text: string) => void;
  className?: string;
}) {
  const t = useTranslations("ai");
  const locale = useLocale();
  const [listening, setListening] = useState(false);
  // Support is a browser fact, not a render input: read it once, after mount,
  // so SSR and the first client render agree (set-state-in-effect is a lint
  // error here, hence the lazy initialiser rather than an effect).
  const [supported] = useState(() => recognitionCtor() !== null);
  const engine = useRef<SpeechRecognitionLike | null>(null);

  const stop = useCallback(() => {
    engine.current?.stop();
    engine.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => engine.current?.abort(), []);

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = SPEECH_LOCALES[locale] ?? "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const text = transcript.trim();
      if (text) onTranscript(text);
    };
    recognition.onerror = (event) => {
      // "aborted" is what a deliberate stop looks like; it is not a failure.
      if (event.error !== "aborted") {
        toast.error(t(event.error === "not-allowed" ? "voice.denied" : "voice.failed"));
      }
      setListening(false);
      engine.current = null;
    };
    recognition.onend = () => {
      setListening(false);
      engine.current = null;
    };

    engine.current = recognition;
    setListening(true);
    recognition.start();
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      aria-label={t(listening ? "voice.stop" : "voice.start")}
      aria-pressed={listening}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-pill transition-colors",
        listening
          ? "animate-pulse bg-primary text-white"
          : "text-muted hover:bg-surface-muted hover:text-ink",
        className,
      )}
    >
      {listening ? <Square className="size-4" aria-hidden /> : <Mic className="size-5" aria-hidden />}
    </button>
  );
}
