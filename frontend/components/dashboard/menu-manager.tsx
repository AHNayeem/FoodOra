"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Star, Flame } from "lucide-react";
import type { MenuSectionWithItems } from "@/frontend/services/catalog";
import { getVendorMenu } from "@/frontend/services/catalog";
import type { CurrencyCode } from "@/frontend/config/regions";
import { formatPrice } from "@/frontend/lib/format";
import { useMerchant } from "@/frontend/stores/merchant";
import { cn } from "@/frontend/lib/utils";
import { useDashboard } from "./dashboard-context";

/**
 * MenuManager — the vendor menu screen (Phase C10). Lists the live menu by
 * section and lets the merchant "86" an item (mark it temporarily unavailable)
 * with an instant toggle. Availability edits persist in the merchant store and
 * overlay the read-only catalog, so a hidden item stays hidden across reloads —
 * the same overlay a real optimistic client cache would apply over the API.
 * (Full item authoring — the Menu Builder — lands in a later phase.)
 */
export function MenuManager() {
  const t = useTranslations("dashboard");
  const { vendor } = useDashboard();
  const currency = vendor.currency as CurrencyCode;

  const [sections, setSections] = useState<MenuSectionWithItems[] | null>(null);

  const unavailable = useMerchant((s) => s.unavailable);
  const hydrated = useMerchant((s) => s.hydrated);
  const toggleItem = useMerchant((s) => s.toggleItem);

  useEffect(() => {
    let active = true;
    getVendorMenu(vendor.id).then((list) => {
      if (active) setSections(list);
    });
    return () => {
      active = false;
    };
  }, [vendor.id]);

  function isLive(foodId: string, baseAvailable: boolean): boolean {
    return baseAvailable && !unavailable.includes(foodId);
  }

  function handleToggle(foodId: string, name: string, willBeLive: boolean) {
    toggleItem(foodId);
    toast.success(willBeLive ? t("itemBackOn", { name }) : t("item86ed", { name }));
  }

  if (!sections) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  const allItems = sections.flatMap((s) => s.items);
  const liveCount = allItems.filter((i) => isLive(i.id, i.isAvailable)).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("menuTitle")}</h1>
          <p className="text-sm text-muted">{t("menuSubtitle")}</p>
        </div>
        <span className="rounded-pill bg-fresh-50 px-3 py-1.5 text-sm font-semibold text-fresh-600">
          {t("liveItems", { live: hydrated ? liveCount : allItems.length, total: allItems.length })}
        </span>
      </header>

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.id}>
            <h2 className="mb-3 text-sm font-bold text-ink">
              {section.name}
              <span className="ms-2 font-medium text-muted">{section.items.length}</span>
            </h2>
            <ul className="space-y-2">
              {section.items.map((item) => {
                const live = hydrated ? isLive(item.id, item.isAvailable) : item.isAvailable;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card transition-opacity",
                      !live && "opacity-60",
                    )}
                  >
                    <Image
                      src={item.image}
                      alt=""
                      width={56}
                      height={56}
                      className="size-14 shrink-0 rounded-field object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                        {item.isPopular && (
                          <Star
                            className="size-3.5 shrink-0 fill-rating text-rating"
                            aria-label={t("popular")}
                          />
                        )}
                        {item.spicyLevel > 0 && (
                          <Flame
                            className="size-3.5 shrink-0 text-primary"
                            aria-hidden
                          />
                        )}
                      </div>
                      <p className="mt-0.5 text-sm font-bold text-ink tabular-nums">
                        {formatPrice(item.price, currency)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2.5">
                      <span
                        className={cn(
                          "hidden text-xs font-semibold sm:inline",
                          live ? "text-fresh-600" : "text-muted",
                        )}
                      >
                        {live ? t("available") : t("soldOut")}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={live}
                        aria-label={t("toggleAvailability", { name: item.name })}
                        disabled={!hydrated}
                        onClick={() => handleToggle(item.id, item.name, !live)}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors disabled:opacity-50",
                          live ? "bg-fresh" : "bg-line",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block size-5 rounded-pill bg-white shadow-sm transition-transform",
                            live
                              ? "translate-x-5 rtl:-translate-x-5"
                              : "translate-x-0.5 rtl:-translate-x-0.5",
                          )}
                        />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
