"use client";

import { useEffect } from "react";
import { useCart } from "@/stores/cart";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartConflictDialog } from "@/components/cart/cart-conflict-dialog";

/**
 * CartMount — one global mount point for the cart overlays. Rehydrates the
 * persisted cart on the client (the store skips auto-hydration to keep SSR and
 * the first client render identical) and renders the drawer + conflict dialog.
 */
export function CartMount() {
  useEffect(() => {
    useCart.persist.rehydrate();
  }, []);

  return (
    <>
      <CartDrawer />
      <CartConflictDialog />
    </>
  );
}
