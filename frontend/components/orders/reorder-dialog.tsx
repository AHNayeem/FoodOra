"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2, PackageX, RotateCcw, X } from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { Order } from "@/types";
import { useCart } from "@/stores/cart";
import { useMenu } from "@/stores/menu";
import { useMerchant } from "@/stores/merchant";
import { getReorderSource } from "@/services/orders";
import { hasReorderChanges, planReorder, type ReorderLine, type ReorderPlan } from "@/lib/reorder";
import { formatPrice } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ReorderButton / ReorderDialog — putting a past order back in the basket
 * (Phase 17, G35).
 *
 * The button used to be a link to the restaurant. What replaces it is the seven
 * steps the spec asks for, in order: load the order, re-resolve every line
 * against the menu as it is now, keep the options that still exist, re-price
 * what is left, say what changed, fill the basket, and open it.
 *
 * The dialog exists because of step five. A reorder whose dish has sold out or
 * doubled in price is still a reorder the customer probably wants — but not one
 * they should discover at checkout, and not one this code may decide for them.
 * So the plan is shown before anything is written: `lib/reorder` works out what
 * is different, and the only thing that happens on a tap is what the customer
 * just read.
 */
export function ReorderButton({
  order,
  size = "sm",
  variant = "ghost",
  className,
}: {
  order: Order;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "outline" | "ghost";
  className?: string;
}) {
  const t = useTranslations("reorder");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        <RotateCcw className="size-4" aria-hidden />
        {t("action")}
      </Button>
      <ReorderDialog order={order} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ReorderDialog({
  order,
  open,
  onClose,
}: {
  order: Order;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="reorder-title" className="sm:max-w-lg">
      {/* The body only exists while the dialog is open, which is what re-resolves
          the plan on every open rather than once: the menu may have moved since
          the last time this was looked at, in the tab next door, by the
          restaurant. Same arrangement as `WriteReviewDialog`'s draft. */}
      {open && <ReorderBody order={order} onClose={onClose} />}
    </Modal>
  );
}

function ReorderBody({ order, onClose }: { order: Order; onClose: () => void }) {
  const t = useTranslations("reorder");
  const [plan, setPlan] = useState<ReorderPlan | null>(null);
  const [failed, setFailed] = useState(false);

  const drafts = useMenu((s) => s.drafts);
  const menuHydrated = useMenu((s) => s.hydrated);
  const suppressed = useMerchant((s) => s.unavailable);
  const merchantHydrated = useMerchant((s) => s.hydrated);
  const cartVendorId = useCart((s) => s.vendor?.id ?? null);
  const cartCount = useCart((s) => s.lines.length);
  const replaceWith = useCart((s) => s.replaceWith);

  // Both stores back the availability answer, and neither the account shell nor
  // the tracker rehydrates them. `persist.rehydrate` is idempotent.
  useEffect(() => {
    void useMenu.persist.rehydrate();
    void useMerchant.persist.rehydrate();
    void useCart.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!menuHydrated || !merchantHydrated) return;
    let live = true;
    getReorderSource(order)
      .then((source) => {
        if (!live) return;
        setPlan(
          planReorder({
            order,
            vendor: source.vendor,
            menu: source.menu,
            draft: drafts[order.vendor.id],
            suppressed,
          }),
        );
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // `drafts`/`suppressed` are read at resolve time on purpose: a menu edit made
    // while this dialog is open does not move the plan under the customer's
    // cursor, it lands the next time they open it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, menuHydrated, merchantHydrated]);

  const currency = order.vendor.currency as CurrencyCode;
  /** The basket holds somebody else's food — the single-vendor rule (C7). */
  const conflicts = cartCount > 0 && cartVendorId !== null && cartVendorId !== order.vendor.id;

  function confirm() {
    if (!plan || plan.empty) return;
    replaceWith(plan.vendor, plan.available);
    onClose();
    toast.success(t("added", { count: plan.available.length }));
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="reorder-title" className="text-h3 text-ink">
            {t("title", { vendor: order.vendor.name })}
          </h2>
          <p className="truncate text-sm text-muted">
            {t("fromOrder", { number: order.orderNumber })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="-me-1 inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-muted hover:bg-surface-muted hover:text-ink"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
        {failed && <p className="py-6 text-center text-sm text-danger">{t("loadFailed")}</p>}

        {!failed && !plan && (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("checking")}
          </p>
        )}

        {plan && (
          <>
            <ul className="space-y-2">
              {plan.lines.map((entry) => (
                <PlanRow
                  key={entry.original.id}
                  entry={entry}
                  currency={currency}
                  vendorSlug={order.vendor.slug}
                />
              ))}
            </ul>

            {plan.empty ? (
              <p className="mt-4 flex items-start gap-2 rounded-field bg-danger/5 p-3 text-sm text-body">
                <PackageX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                {t("nothingLeft", { vendor: order.vendor.name })}
              </p>
            ) : (
              <>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-base font-bold text-ink">
                  <span>{t("subtotal")}</span>
                  <span className="tabular-nums">{formatPrice(plan.subtotal, currency)}</span>
                </div>
                {plan.subtotal !== plan.previousSubtotal && (
                  <p className="mt-1 text-end text-xs text-muted">
                    {t("previously", {
                      amount: formatPrice(plan.previousSubtotal, currency),
                    })}
                  </p>
                )}
                {hasReorderChanges(plan) && (
                  <p className="mt-3 flex items-start gap-2 rounded-field bg-accent-50 p-3 text-sm text-accent-600">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {t("changedNotice")}
                  </p>
                )}
                {/* Answered once, here, rather than per line by `cart.add`'s own
                    prompt — which is why the reorder writes through `replaceWith`. */}
                {conflicts && (
                  <p className="mt-3 rounded-field bg-surface-muted p-3 text-sm text-body">
                    {t("cartConflict")}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line px-5 py-4 sm:flex-row">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          {t("cancel")}
        </Button>
        {plan?.empty ? (
          <Button href={`/restaurants/${order.vendor.slug}`} className="flex-1">
            {t("browseMenu")}
          </Button>
        ) : (
          <Button className="flex-1" onClick={confirm} disabled={!plan}>
            {conflicts ? t("startNewBasket") : t("addToBasket")}
          </Button>
        )}
      </div>
    </>
  );
}

/** One line of the plan: what it was, what it is now, and what changed. */
function PlanRow({
  entry,
  currency,
  vendorSlug,
}: {
  entry: ReorderLine;
  currency: CurrencyCode;
  vendorSlug: string;
}) {
  const t = useTranslations("reorder");
  const gone = entry.line === null;
  const line = entry.line ?? entry.original;

  return (
    <li
      className={cn(
        "flex items-start justify-between gap-3 rounded-field border p-3",
        gone ? "border-danger/30 bg-danger/5" : "border-line bg-surface",
      )}
    >
      <div className="min-w-0">
        <p className={cn("text-sm font-semibold", gone ? "text-muted line-through" : "text-ink")}>
          {entry.original.quantity}× {line.name}
        </p>
        {line.options.length > 0 && (
          <p className="truncate text-xs text-muted">
            {line.options.map((o) => o.name).join(", ")}
          </p>
        )}
        {entry.issue && (
          <p
            className={cn(
              "mt-1 text-xs font-semibold",
              gone ? "text-danger" : "text-accent-600",
            )}
          >
            {entry.issue === "options-changed"
              ? t("issue.optionsChanged", { options: entry.droppedOptions.join(", ") })
              : t(`issue.${entry.issue}`)}
          </p>
        )}
        {/* A required choice that no longer exists is the one case the customer
            has to resolve on the dish itself — so it links there. */}
        {entry.issue === "needs-choice" && (
          <Button
            href={`/restaurants/${vendorSlug}`}
            variant="ghost"
            size="sm"
            className="mt-1 -ms-3.5"
          >
            {t("chooseAgain")}
          </Button>
        )}
      </div>
      <span className="shrink-0 text-end text-sm font-medium text-ink tabular-nums">
        {gone ? (
          <span className="text-muted">—</span>
        ) : (
          <>
            {formatPrice(line.unitPrice * line.quantity, currency)}
            {entry.issue === "repriced" && (
              <span className="block text-xs font-normal text-muted line-through">
                {formatPrice(entry.original.unitPrice * entry.original.quantity, currency)}
              </span>
            )}
          </>
        )}
      </span>
    </li>
  );
}
