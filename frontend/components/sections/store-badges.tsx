"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Apple, Play } from "lucide-react";

/**
 * StoreBadges — App Store / Google Play buttons. There is no real app in the
 * prototype, so a tap surfaces a "coming soon" toast (simulate every action)
 * rather than linking to a dead store page.
 */
export function StoreBadges() {
  const t = useTranslations("home");

  const stores = [
    { icon: Apple, top: t("appStoreTop"), bottom: t("appStore") },
    { icon: Play, top: t("googlePlayTop"), bottom: t("googlePlay") },
  ] as const;

  return (
    <div className="flex flex-wrap gap-3">
      {stores.map(({ icon: Icon, top, bottom }) => (
        <button
          key={bottom}
          type="button"
          onClick={() => toast(t("appComingSoon"))}
          className="inline-flex items-center gap-3 rounded-field bg-ink px-4 py-2.5 text-white transition-transform active:scale-[0.98] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          aria-label={`${top} ${bottom}`}
        >
          <Icon className="size-6 shrink-0" aria-hidden />
          <span className="text-start leading-tight">
            <span className="block text-[0.65rem] uppercase tracking-wide opacity-80">
              {top}
            </span>
            <span className="block text-sm font-semibold">{bottom}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
