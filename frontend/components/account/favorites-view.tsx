"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Heart, Store, Trash2, UtensilsCrossed } from "lucide-react";
import type { CurrencyCode } from "@/frontend/config/regions";
import type { FavoriteDish, FavoritesBoard } from "@/frontend/services/favorites";
import { getFavorites } from "@/frontend/services/favorites";
import { useFavorites } from "@/frontend/stores/favorites";
import { VendorCard } from "@/frontend/components/cards/vendor-card";
import { AddToCartButton } from "@/frontend/components/menu/add-to-cart-button";
import { Button } from "@/frontend/components/ui/button";
import { toCartVendor } from "@/frontend/lib/cart";
import { formatPrice } from "@/frontend/lib/format";
import { cn } from "@/frontend/lib/utils";

type Tab = "vendors" | "dishes";

/**
 * FavoritesView — the customer's saved places and dishes (Phase C23).
 *
 * The store holds ids; this resolves them through `services/favorites` on every
 * change, so un-hearting an item here re-runs the same join a page load would.
 * The two collections are tabbed rather than stacked because either can be long,
 * and the tab defaults to whichever actually has content.
 */
export function FavoritesView() {
  const t = useTranslations("favorites");
  const hydrated = useFavorites((s) => s.hydrated);
  const vendorIds = useFavorites((s) => s.vendorIds);
  const foodIds = useFavorites((s) => s.foodIds);
  const [board, setBoard] = useState<FavoritesBoard | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let current = true;
    getFavorites({ vendorIds, foodIds }).then((next) => {
      if (current) setBoard(next);
    });
    return () => {
      current = false;
    };
  }, [hydrated, vendorIds, foodIds]);

  if (!hydrated || !board) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  const { vendors, dishes, stale } = board;

  if (vendors.length === 0 && dishes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line bg-surface py-16 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <Heart className="size-7" aria-hidden />
        </span>
        <p className="text-lg font-semibold text-ink">{t("emptyTitle")}</p>
        <p className="max-w-sm text-body">{t("emptyBody")}</p>
        <Button href="/restaurants" className="mt-2">
          {t("emptyCta")}
        </Button>
      </div>
    );
  }

  // Only fall back to dishes when there is nothing to show under restaurants.
  const active: Tab = tab ?? (vendors.length === 0 ? "dishes" : "vendors");

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label={t("title")} className="flex gap-2">
        <TabButton
          active={active === "vendors"}
          onClick={() => setTab("vendors")}
          icon={<Store className="size-4" aria-hidden />}
          label={t("tabVendors")}
          count={vendors.length}
        />
        <TabButton
          active={active === "dishes"}
          onClick={() => setTab("dishes")}
          icon={<UtensilsCrossed className="size-4" aria-hidden />}
          label={t("tabDishes")}
          count={dishes.length}
        />
      </div>

      {stale > 0 && (
        <p className="rounded-field border border-line bg-surface-muted px-4 py-2.5 text-sm text-muted">
          {t("stale", { count: stale })}
        </p>
      )}

      {active === "vendors" ? (
        vendors.length === 0 ? (
          <EmptyTab message={t("noVendors")} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {vendors.map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} />
            ))}
          </div>
        )
      ) : dishes.length === 0 ? (
        <EmptyTab message={t("noDishes")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {dishes.map((dish) => (
            <DishRow key={dish.food.id} dish={dish} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border px-4 py-2 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-line bg-surface text-body hover:bg-surface-muted hover:text-ink",
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded-pill px-1.5 text-xs",
          active ? "bg-primary text-white" : "bg-surface-muted text-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <p className="rounded-panel border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
      {message}
    </p>
  );
}

/**
 * A saved dish. Unlike the menu card this always names its vendor (the dish
 * arrives with no page context) and offers the un-save directly, since removing
 * things is the main reason to visit this list.
 */
function DishRow({ dish }: { dish: FavoriteDish }) {
  const t = useTranslations("favorites");
  const removeFood = useFavorites((s) => s.removeFood);
  const { food, vendor } = dish;
  const currency = vendor.currency as CurrencyCode;

  return (
    <li className="flex gap-4 rounded-card border border-line bg-surface p-3">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-field bg-surface-muted sm:size-24">
        <Image src={food.image} alt={food.name} fill sizes="96px" className="object-cover" />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-ink">{food.name}</h3>
        <Link
          href={`/restaurants/${vendor.slug}`}
          className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary"
        >
          <Store className="size-3.5" aria-hidden />
          {vendor.name}
        </Link>
        <p className="mt-1 line-clamp-1 text-sm text-body">{food.description}</p>
        <p className="mt-1 font-semibold text-ink">{formatPrice(food.price, currency)}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <button
          type="button"
          onClick={() => removeFood(food.id)}
          aria-label={t("removeLabel", { name: food.name })}
          className="inline-flex size-9 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-danger"
        >
          <Trash2 className="size-4.5" aria-hidden />
        </button>
        {food.isAvailable && <AddToCartButton item={food} vendor={toCartVendor(vendor)} />}
      </div>
    </li>
  );
}
