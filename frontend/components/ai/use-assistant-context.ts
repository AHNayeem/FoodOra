"use client";

import { useMemo } from "react";
import type { AssistantContext } from "@/frontend/types";
import { useAssistant } from "@/frontend/stores/assistant";
import { useFavorites } from "@/frontend/stores/favorites";
import { useOrders, liveOrders } from "@/frontend/stores/orders";
import { useSettings } from "@/frontend/stores/settings";

/**
 * Assemble what this device knows about the customer into the seam's
 * {@link AssistantContext} — the C16 `BookContext` / C18 `RiderContext` / C22
 * `ReviewContext` pattern, gathered in one hook so no surface builds a
 * half-context of its own.
 *
 * Two decisions worth naming:
 *
 *  - **The privacy switch is read, not obeyed, here.** `personalized` is passed
 *    *into* the seam and enforced there, at the single point every answer goes
 *    through. A component that filtered the history itself would be one more
 *    place the rule could be forgotten. Its default when settings have not been
 *    loaded yet is `true`, matching the seeded default in C28 — and the seam
 *    still gets the flag either way.
 *  - **History is dishes, not orders.** The assistant needs "what have you
 *    eaten", which is every line of every order, newest first and deduplicated;
 *    the orders themselves only matter for the live-tracking answer.
 */
export function useAssistantContext(): AssistantContext {
  const profile = useAssistant((s) => s.profile);
  const scopeVendorId = useAssistant((s) => s.scopeVendorId);
  const favoriteVendorIds = useFavorites((s) => s.vendorIds);
  const favoriteFoodIds = useFavorites((s) => s.foodIds);
  const orders = useOrders((s) => s.orders);
  const settings = useSettings((s) => s.settings);

  return useMemo(() => {
    const newestFirst = [...orders].sort(
      (a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt),
    );
    return {
      profile,
      recentVendorIds: [...new Set(newestFirst.map((o) => o.vendor.id))].slice(0, 8),
      recentFoodIds: [
        ...new Set(newestFirst.flatMap((o) => o.lines.map((line) => line.foodId))),
      ].slice(0, 12),
      favoriteVendorIds,
      favoriteFoodIds,
      activeOrderIds: liveOrders(orders).map((o) => o.id),
      personalized: settings?.privacy.personalizedRecommendations ?? true,
      vendorId: scopeVendorId,
    };
  }, [profile, orders, favoriteVendorIds, favoriteFoodIds, settings, scopeVendorId]);
}
