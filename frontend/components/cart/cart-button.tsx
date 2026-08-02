"use client";

import { useTranslations } from "next-intl";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/frontend/stores/cart";
import { cartCount } from "@/frontend/lib/cart";
import { cn } from "@/frontend/lib/utils";

/**
 * CartButton — header entry point to the cart. Shows a live item-count badge
 * once the persisted cart has rehydrated (gated on `hydrated` so SSR and the
 * first client render match).
 */
export function CartButton({ className }: { className?: string }) {
  const t = useTranslations("cart");
  const lines = useCart((s) => s.lines);
  const hydrated = useCart((s) => s.hydrated);
  const open = useCart((s) => s.open);
  const count = hydrated ? cartCount(lines) : 0;

  return (
    <button
      type="button"
      onClick={open}
      aria-label={count > 0 ? `${t("open")} (${count})` : t("open")}
      className={cn(
        // 44px on touch layouts (the minimum comfortable tap target), 40px once
        // there is a mouse and the header is dense.
        "relative inline-flex size-11 items-center justify-center rounded-pill text-ink transition-colors hover:bg-surface-muted lg:size-10",
        className,
      )}
    >
      <ShoppingBag className="size-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-pill bg-primary px-1 text-xs font-bold text-white">
          {count}
        </span>
      )}
    </button>
  );
}
