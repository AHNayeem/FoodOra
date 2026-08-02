"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { useAssistant } from "@/frontend/stores/assistant";
import { useSettings } from "@/frontend/stores/settings";
import { AssistantPanel } from "./assistant-panel";

/**
 * AssistantMount — one global mount point for the assistant, the `CartMount`
 * pattern: rehydrate the persisted stores it reads, then render the launcher
 * and the panel.
 *
 * Two stores are rehydrated here rather than in the panel, because both have to
 * be ready *before* the first question is asked: the assistant's own thread and
 * profile, and the settings whose privacy switch decides whether the answer may
 * use the customer's history at all.
 *
 * The launcher hides itself on `/ai` (where the assistant already fills the
 * page) and inside the checkout flow — a floating button over a payment step is
 * a distraction from the one thing that screen is for.
 */
const HIDDEN_ON = ["/ai", "/checkout"];

export function AssistantMount() {
  const t = useTranslations("ai");
  const pathname = usePathname();
  const open = useAssistant((s) => s.open);
  const openPanel = useAssistant((s) => s.openPanel);

  useEffect(() => {
    useAssistant.persist.rehydrate();
    useSettings.persist.rehydrate();
  }, []);

  const hidden = HIDDEN_ON.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  return (
    <>
      {!hidden && !open && (
        <button
          type="button"
          onClick={() => openPanel(null)}
          aria-label={t("launch")}
          className="fixed bottom-5 end-5 z-40 inline-flex h-13 items-center gap-2 rounded-pill bg-primary px-4 text-white shadow-menu transition-[transform,background] duration-[var(--duration-fast)] hover:bg-primary-600 active:scale-95"
        >
          <Sparkles className="size-5" aria-hidden />
          <span className="hidden text-sm font-semibold sm:inline">{t("launchShort")}</span>
        </button>
      )}
      <AssistantPanel />
    </>
  );
}

/**
 * AskAssistantButton — an in-page entry point that opens the panel already
 * scoped to a restaurant, so "is anything here safe for me?" is answered from
 * that menu instead of the whole catalogue.
 */
export function AskAssistantButton({
  vendorId,
  label,
  className,
}: {
  vendorId?: string;
  label?: string;
  className?: string;
}) {
  const t = useTranslations("ai");
  const openPanel = useAssistant((s) => s.openPanel);
  return (
    <button
      type="button"
      onClick={() => openPanel(vendorId ?? null)}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
      }
    >
      <Sparkles className="size-4 text-primary" aria-hidden />
      {label ?? t("askAbout")}
    </button>
  );
}
