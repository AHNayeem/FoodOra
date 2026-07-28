"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * OtpInput — a segmented 6-digit code entry. Controlled: holds the whole code
 * in the parent, renders one cell per digit, auto-advances on type, steps back
 * on backspace, and accepts a pasted code. Digits only.
 */
interface OtpInputProps {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  disabled?: boolean;
  ariaLabel: string;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  ariaLabel,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function setDigit(index: number, digit: string) {
    const chars = value.split("");
    chars[index] = digit;
    onChange(chars.join("").slice(0, length));
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    setDigit(index, digit);
    if (index < length - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        setDigit(index - 1, "");
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!digits) return;
    onChange(digits);
    refs.current[Math.min(digits.length, length - 1)]?.focus();
  }

  return (
    <div className="flex gap-2" role="group" aria-label={ariaLabel} onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          aria-label={`${ariaLabel} ${i + 1}`}
          className={cn(
            "h-12 w-full rounded-field border border-line bg-surface text-center text-lg font-semibold text-ink",
            "outline-none transition-[border-color,box-shadow]",
            "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30",
            "disabled:opacity-60",
          )}
        />
      ))}
    </div>
  );
}
