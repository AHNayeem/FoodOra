"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, ScanText } from "lucide-react";
import { ACCEPTED_IMAGE_TYPES, type ImageFingerprint } from "@/services/ai";
import { cn } from "@/lib/utils";

/**
 * ImageScanButton — the camera door (spec: Image Search, Food Recognition, OCR
 * Menu Scanner).
 *
 * Two modes behind one control: a photo of a *dish* is asking "what is this and
 * where can I get it", a photo of a *menu* is asking "read this for me". They
 * differ only in what the seam does with the match, so the picker offers both
 * and lets the customer say which.
 *
 * **The file never leaves the browser.** Only its name, size and type are
 * passed to the seam — enough to fingerprint it deterministically, which is all
 * a prototype without a vision model can honestly use. The UI says so on every
 * result rather than burying it here.
 */
export function ImageScanButton({
  onScan,
  disabled,
  className,
}: {
  onScan: (file: ImageFingerprint, mode: "dish" | "menu") => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("ai");
  const [open, setOpen] = useState(false);
  const mode = useRef<"dish" | "menu">("dish");
  const input = useRef<HTMLInputElement>(null);

  function pick(next: "dish" | "menu") {
    mode.current = next;
    setOpen(false);
    input.current?.click();
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so picking the *same* file twice fires a change again.
    event.target.value = "";
    if (!file) return;
    onScan({ name: file.name, size: file.size, type: file.type }, mode.current);
  }

  return (
    <div className={cn("relative shrink-0", className)}>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        capture="environment"
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-label={t("scan.open")}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex size-10 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-50"
      >
        <Camera className="size-5" aria-hidden />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="animate-pop-in absolute bottom-12 start-0 z-20 w-56 overflow-hidden rounded-card border border-line bg-surface shadow-menu"
          >
            <MenuItem icon={<Camera className="size-4" aria-hidden />} onClick={() => pick("dish")}>
              {t("scan.modeDish")}
            </MenuItem>
            <MenuItem icon={<ScanText className="size-4" aria-hidden />} onClick={() => pick("menu")}>
              {t("scan.modeMenu")}
            </MenuItem>
            <p className="border-t border-line px-3 py-2 text-xs text-muted">{t("scan.privacy")}</p>
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start text-sm font-medium text-ink transition-colors hover:bg-surface-muted"
    >
      <span className="text-primary">{icon}</span>
      {children}
    </button>
  );
}
