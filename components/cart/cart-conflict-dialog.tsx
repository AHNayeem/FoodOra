"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useCart } from "@/stores/cart";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * CartConflictDialog — surfaced when an item from a different vendor is added
 * (a cart is single-vendor). Mounted once globally; it watches the store's
 * `pending` add and lets the user start a fresh cart or keep the current one.
 */
export function CartConflictDialog() {
  const t = useTranslations("cart");
  const pending = useCart((s) => s.pending);
  const currentVendor = useCart((s) => s.vendor);
  const confirmSwitch = useCart((s) => s.confirmSwitch);
  const cancelSwitch = useCart((s) => s.cancelSwitch);

  return (
    <Modal open={!!pending} onClose={cancelSwitch} labelledBy="cart-conflict-title">
      <div className="p-6">
        <h2 id="cart-conflict-title" className="text-h3 text-ink">
          {t("switchTitle")}
        </h2>
        <p className="mt-2 text-sm text-body">
          {t("switchBody", { current: currentVendor?.name ?? "" })}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            size="md"
            className="flex-1"
            onClick={() => {
              confirmSwitch();
              if (pending) toast.success(t("added", { name: pending.line.name }));
            }}
          >
            {t("startNewCart")}
          </Button>
          <Button type="button" variant="outline" size="md" className="flex-1" onClick={cancelSwitch}>
            {t("keepCart")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
