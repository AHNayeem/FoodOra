"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { useAuth } from "@/frontend/stores/auth";
import { useFavorites } from "@/frontend/stores/favorites";
import { cn } from "@/frontend/lib/utils";

/**
 * FavoriteButton — the heart that saves a vendor or a dish (Phase C23).
 *
 * `overlay` sits on a card image (opaque pill so it reads over any photo);
 * `plain` is an inline icon button for list rows and headers.
 *
 * Saving requires a session, so a signed-out tap explains why and points at
 * login rather than silently writing to a set nobody owns. Until the store has
 * rehydrated the heart renders empty and inert — the same logged-out-first rule
 * the header follows, so there is no SSR mismatch and no flicker to a filled
 * heart the server never rendered.
 */
export function FavoriteButton({
  kind,
  id,
  name,
  variant = "overlay",
  className,
}: {
  kind: "vendor" | "food";
  id: string;
  /** Shown in the toast and the accessible label, so the action names its target. */
  name: string;
  variant?: "overlay" | "plain";
  className?: string;
}) {
  const t = useTranslations("favorites");
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const authHydrated = useAuth((s) => s.hydrated);
  const hydrated = useFavorites((s) => s.hydrated);
  const saved = useFavorites((s) =>
    hydrated && (kind === "vendor" ? s.vendorIds.includes(id) : s.foodIds.includes(id)),
  );
  const toggleVendor = useFavorites((s) => s.toggleVendor);
  const toggleFood = useFavorites((s) => s.toggleFood);

  function onClick() {
    if (!authHydrated) return;
    if (!user) {
      toast.error(t("signInToSave"), {
        action: { label: t("signIn"), onClick: () => router.push("/login") },
      });
      return;
    }
    if (kind === "vendor") toggleVendor(id);
    else toggleFood(id);
    // `saved` is this render's value, so the message describes the new state.
    if (saved) {
      toast(t("removed", { name }));
    } else {
      toast.success(t("added", { name }), {
        action: { label: t("view"), onClick: () => router.push("/account/favorites") },
      });
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hydrated}
      aria-pressed={saved}
      aria-label={saved ? t("removeLabel", { name }) : t("addLabel", { name })}
      className={cn(
        "inline-flex items-center justify-center transition-[color,background-color,transform] active:scale-90",
        variant === "overlay"
          ? "size-9 rounded-pill bg-surface/90 text-ink shadow-sm backdrop-blur-sm hover:bg-surface"
          : "size-9 rounded-pill text-muted hover:bg-surface-muted hover:text-ink",
        saved && "text-primary",
        className,
      )}
    >
      <Heart className={cn("size-4.5", saved && "fill-current")} aria-hidden />
    </button>
  );
}
