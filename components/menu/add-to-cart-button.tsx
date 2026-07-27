"use client";

import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * AddToCartButton — placeholder for the cart action. The cart store lands in
 * Phase C7; until then this confirms the interaction with a toast so the menu
 * feels live. Swapping in the store touches only this component.
 */
export function AddToCartButton({
  itemName,
  disabled,
  className,
}: {
  itemName: string;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations();

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${t("restaurant.add")} — ${itemName}`}
      onClick={() => toast.success(`${itemName} — ${t("restaurant.add")}`)}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-field bg-primary text-white shadow-sm transition-[transform,background] duration-[var(--duration-fast)] hover:bg-primary-600 active:scale-90 disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      <Plus className="size-5" aria-hidden />
    </button>
  );
}
