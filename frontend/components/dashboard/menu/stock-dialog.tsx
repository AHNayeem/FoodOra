"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import type { MenuBoardItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

/**
 * StockDialog — the inventory controls for one dish (Phase 9, G21).
 *
 * Availability used to be a single boolean, so "we have four left" and "we ran out
 * an hour ago" were the same fact. This is the count, its low-stock threshold, the
 * manual adjustment, and the one thing worth stating on screen: **an item at zero
 * takes itself off the menu.** The merchant is told that rather than discovering it,
 * because a dish disappearing from the storefront without anybody switching it off is
 * alarming if you do not know the rule.
 *
 * Tracking is opt-in and can be turned off again, which is why there is no "tracked"
 * switch beside the number: the count's *existence* is the tracking, and a flag
 * beside it would be a second way to say the same thing.
 *
 * The manual adjustment buttons write straight through to the store rather than into
 * the form's own numbers: an adjustment is a real change to the count the moment it
 * is made, and holding it in the dialog until "save" would let the merchant close it
 * and lose a tray of food they had already served.
 */
export function StockDialog({
  onClose,
  entry,
  onSave,
  onAdjust,
  onStopTracking,
}: {
  onClose: () => void;
  entry: MenuBoardItem;
  onSave: (input: { quantity: number; lowStockThreshold: number }) => void;
  /** Manual adjustment — only offered on an item already being counted. */
  onAdjust: (delta: number) => void;
  onStopTracking: () => void;
}) {
  const t = useTranslations("menuBuilder");

  // Initialised once: the dialog is mounted only while it is open and keyed by the
  // dish, so there is nothing for an effect to re-sync — and the count the merchant
  // is typing survives the board re-folding underneath it.
  const [quantity, setQuantity] = useState(() => String(entry.stock?.quantity ?? 0));
  const [threshold, setThreshold] = useState(() =>
    String(entry.stock?.lowStockThreshold ?? 0),
  );

  const tracked = entry.stock != null;

  return (
    <Modal open onClose={onClose} labelledBy="stock-title" className="p-5">
      <h2 id="stock-title" className="text-h3 text-ink">
        {t("stockTitle")}
      </h2>
      <p className="mt-1 text-sm text-body">{entry.item.name}</p>
      <p className="mt-2 rounded-field bg-surface-muted p-3 text-xs text-muted">
        {t("stockRule")}
      </p>

      {tracked && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-field border border-line p-3">
          <span className="text-sm font-semibold text-ink">
            {t("stockOnHand", { count: entry.stock!.quantity })}
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onAdjust(-1)}
              aria-label={t("stockDecrement")}
              className="inline-flex size-9 items-center justify-center rounded-pill border border-line text-ink hover:bg-surface-muted"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onAdjust(1)}
              aria-label={t("stockIncrement")}
              className="inline-flex size-9 items-center justify-center rounded-pill border border-line text-ink hover:bg-surface-muted"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </span>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field id="stock-qty" label={t("stockQuantity")}>
          {({ id }) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          )}
        </Field>
        <Field id="stock-low" label={t("stockThreshold")} hint={t("stockThresholdHint")}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="number"
              inputMode="numeric"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {tracked && (
          <Button variant="ghost" size="sm" onClick={onStopTracking}>
            {t("stockStop")}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onSave({
              quantity: Number(quantity),
              lowStockThreshold: Number(threshold),
            })
          }
        >
          {tracked ? t("save") : t("stockStart")}
        </Button>
      </div>
    </Modal>
  );
}
