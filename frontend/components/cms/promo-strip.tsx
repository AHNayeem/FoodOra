"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CmsBanner, CmsBannerPlacement } from "@/frontend/types";
import { useCmsBanners } from "@/frontend/components/cms/use-cms-content";
import { DashIcon } from "@/frontend/components/directory/dash-icon";
import { cn } from "@/frontend/lib/utils";

/**
 * PromoStrip — the promotional banners of one placement (spec: CMS —
 * Promotions).
 *
 * A banner is a document with a publication window, so "this offer runs for two
 * weeks" is data rather than a deploy: the seam refuses to return one whose
 * window has not opened, and the strip below is only ever what is live now.
 * Nothing here knows about a campaign — it renders whatever the placement holds.
 */
const TONE: Record<CmsBanner["tone"], { wrap: string; icon: string; cta: string }> = {
  primary: {
    wrap: "border-primary/25 bg-primary/5",
    icon: "bg-primary text-white",
    cta: "text-primary",
  },
  ink: {
    wrap: "border-ink/15 bg-ink text-white",
    icon: "bg-white/15 text-white",
    cta: "text-white",
  },
  accent: {
    wrap: "border-warning/30 bg-warning/10",
    icon: "bg-warning text-ink",
    cta: "text-ink",
  },
};

export function PromoStrip({
  placement,
  banners,
  className,
}: {
  placement: CmsBannerPlacement;
  banners: CmsBanner[];
  className?: string;
}) {
  const live = useCmsBanners(placement, banners);
  if (live.length === 0) return null;

  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {live.map((banner) => {
        const tone = TONE[banner.tone];
        return (
          <li
            key={banner.id}
            className={cn("flex items-start gap-4 rounded-panel border p-5", tone.wrap)}
          >
            <span
              className={cn(
                "inline-flex size-11 shrink-0 items-center justify-center rounded-pill",
                tone.icon,
              )}
            >
              <DashIcon name={banner.icon} className="size-5" />
            </span>
            <div className="min-w-0">
              {banner.eyebrow && (
                <p
                  className={cn(
                    "text-xs font-bold uppercase tracking-wide",
                    banner.tone === "ink" ? "text-white/60" : "text-muted",
                  )}
                >
                  {banner.eyebrow}
                </p>
              )}
              <h3 className="mt-0.5 text-lg font-bold">{banner.title}</h3>
              {banner.subtitle && (
                <p className={cn("mt-1 text-sm", banner.tone === "ink" ? "text-white/75" : "text-body")}>
                  {banner.subtitle}
                </p>
              )}
              {banner.ctaLabel && (
                <Link
                  href={banner.ctaHref}
                  className={cn(
                    "mt-3 inline-flex items-center gap-1 text-sm font-semibold hover:underline",
                    tone.cta,
                  )}
                >
                  {banner.ctaLabel}
                  <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
