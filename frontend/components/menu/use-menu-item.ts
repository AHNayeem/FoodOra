"use client";

import { useEffect } from "react";
import type { FoodItem, MenuBoardItem } from "@/types";
import { useMenu } from "@/stores/menu";
import { useMerchant } from "@/stores/merchant";
import { effectiveItem } from "@/lib/menu";

/**
 * useMenuItem — the dish as its restaurant has actually authored it (Phase 9).
 *
 * The storefront's menu is server-rendered from `services/catalog`, which cannot see
 * a client-side draft. The *interactive* half can: the add-to-cart button, the
 * customiser and the QR table row are all client components that already receive a
 * `FoodItem` as a prop, and this resolves that prop through the same fold the
 * merchant's board uses.
 *
 * That matters most for option groups, which is the spec's explicit requirement for
 * this phase: a group the restaurant built in the menu builder has to be the group
 * the customiser renders and the group the cart line prices. Because both sides go
 * through `lib/menu.effectiveItem`, they are the same `FoodOptionGroup` record and
 * not two interpretations of one.
 *
 * Returns `null` when the restaurant has taken the dish off the menu — a deleted
 * item must not be orderable just because a cached page still lists it.
 *
 * **Before hydration it returns the prop unchanged**, which is deliberate: the first
 * client render has to match the server's, and assuming an edit exists while the
 * draft is still being read would swap a price under the customer's cursor. The
 * update lands one render later, the same contract every other store in this app
 * follows.
 */
export function useMenuItem(item: FoodItem): MenuBoardItem | null {
  const drafts = useMenu((s) => s.drafts);
  const menuHydrated = useMenu((s) => s.hydrated);
  const unavailable = useMerchant((s) => s.unavailable);
  const merchantHydrated = useMerchant((s) => s.hydrated);

  // Both stores back the answer and the storefront shell rehydrates neither, so
  // this asks. `persist.rehydrate` is idempotent.
  useEffect(() => {
    void useMenu.persist.rehydrate();
    void useMerchant.persist.rehydrate();
  }, []);

  if (!menuHydrated || !merchantHydrated) {
    return effectiveItem(item, null, []);
  }
  return effectiveItem(item, drafts[item.vendorId], unavailable);
}
