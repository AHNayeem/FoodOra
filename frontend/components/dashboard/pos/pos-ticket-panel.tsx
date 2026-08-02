"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Receipt, Trash2, Percent, X, Table2, PauseCircle } from "lucide-react";
import type {
  PosDiscount,
  PosOrderType,
  PosPricing,
  PosTicketLine,
  RestaurantTable,
} from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { formatPrice } from "@/frontend/lib/format";
import { POS_ORDER_TYPES, POS_QUICK_DISCOUNTS, ticketCount } from "@/frontend/lib/pos";
import { QuantityStepper } from "@/frontend/components/cart/quantity-stepper";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";

/**
 * PosTicketPanel — the live order pane. Order type + table, the running line
 * list with steppers, a quick-discount control, an optional kitchen note, the
 * totals breakdown, and the hold / charge actions. Purely presentational — all
 * state and mutations live on the terminal.
 */
export function PosTicketPanel({
  lines,
  pricing,
  currency,
  orderType,
  onOrderType,
  tables,
  tableId,
  onTable,
  discount,
  onDiscount,
  note,
  onNote,
  onQty,
  onRemove,
  onClear,
  onHold,
  onCharge,
  heldCount,
  onOpenHeld,
}: {
  lines: PosTicketLine[];
  pricing: PosPricing;
  currency: CurrencyCode;
  orderType: PosOrderType;
  onOrderType: (t: PosOrderType) => void;
  tables: RestaurantTable[];
  tableId: string | null;
  onTable: (id: string | null) => void;
  discount: PosDiscount | null;
  onDiscount: (d: PosDiscount | null) => void;
  note: string;
  onNote: (v: string) => void;
  onQty: (lineId: string, next: number) => void;
  onRemove: (lineId: string) => void;
  onClear: () => void;
  onHold: () => void;
  onCharge: () => void;
  heldCount: number;
  onOpenHeld: () => void;
}) {
  const t = useTranslations("pos");
  const empty = lines.length === 0;
  const count = ticketCount(lines);
  const activePct = discount?.type === "percent" ? discount.value : null;

  return (
    <div className="flex max-h-[calc(100dvh-7rem)] flex-col rounded-panel border border-line bg-surface shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Receipt className="size-4.5 text-primary" aria-hidden />
          <h2 className="text-sm font-bold text-ink">{t("ticketTitle")}</h2>
          {count > 0 && (
            <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary tabular-nums">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenHeld}
            className="relative inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-xs font-semibold text-body transition-colors hover:bg-surface-muted"
          >
            <PauseCircle className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t("heldTickets")}</span>
            {heldCount > 0 && (
              <span className="inline-flex min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[11px] font-bold text-white tabular-nums">
                {heldCount}
              </span>
            )}
          </button>
          {!empty && (
            <button
              type="button"
              onClick={onClear}
              aria-label={t("clearTicket")}
              className="inline-flex size-8 items-center justify-center rounded-pill text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Order type */}
      <div className="border-b border-line px-4 py-3">
        <div className="flex gap-1 rounded-pill bg-surface-muted p-1">
          {POS_ORDER_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onOrderType(type)}
              aria-pressed={orderType === type}
              className={cn(
                "flex-1 rounded-pill py-1.5 text-xs font-semibold transition-colors",
                orderType === type
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink",
              )}
            >
              {t(`orderType.${type}`)}
            </button>
          ))}
        </div>

        {orderType === "dine-in" && (
          <div className="mt-2.5">
            {tables.length === 0 ? (
              <p className="text-xs text-muted">{t("noTables")}</p>
            ) : (
              <label className="flex items-center gap-2">
                <Table2 className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="sr-only">{t("selectTable")}</span>
                <select
                  value={tableId ?? ""}
                  onChange={(e) => onTable(e.target.value || null)}
                  className="h-9 flex-1 rounded-field border border-line bg-surface px-2.5 text-sm text-ink outline-none focus:border-primary"
                >
                  <option value="">{t("noTable")}</option>
                  {tables.map((tbl) => (
                    <option key={tbl.id} value={tbl.id}>
                      {t("tableOption", { label: tbl.label, seats: tbl.seats })}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {empty ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-1 text-center">
            <Receipt className="size-8 text-line" aria-hidden />
            <p className="text-sm font-semibold text-ink">{t("emptyTicket")}</p>
            <p className="text-xs text-muted">{t("emptyTicketHint")}</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {lines.map((line) => (
              <li key={line.id} className="flex items-center gap-2.5">
                <Image
                  src={line.image}
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 shrink-0 rounded-field object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {line.name}
                  </p>
                  <p className="text-xs text-muted tabular-nums">
                    {formatPrice(line.unitPrice, currency)}
                  </p>
                </div>
                <QuantityStepper
                  value={line.quantity}
                  onChange={(next) => onQty(line.id, next)}
                  min={1}
                  removable
                  decrementLabel={t("decrement", { name: line.name })}
                  incrementLabel={t("increment", { name: line.name })}
                />
                <span className="w-16 shrink-0 text-end text-sm font-bold text-ink tabular-nums">
                  {formatPrice(line.unitPrice * line.quantity, currency)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(line.id)}
                  aria-label={t("removeLine", { name: line.name })}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Discount + note + totals + actions */}
      {!empty && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Percent className="size-3.5" aria-hidden />
              {t("discount")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {POS_QUICK_DISCOUNTS.map((pct) => {
                const active = activePct === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      onDiscount(active ? null : { type: "percent", value: pct })
                    }
                    className={cn(
                      "rounded-pill px-3 py-1 text-xs font-bold transition-colors tabular-nums",
                      active
                        ? "bg-accent text-white"
                        : "bg-surface-muted text-body hover:text-ink",
                    )}
                  >
                    {t("discountPercent", { value: pct })}
                  </button>
                );
              })}
            </div>
          </div>

          <input
            type="text"
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder={t("notePlaceholder")}
            aria-label={t("note")}
            className="h-9 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-primary"
          />

          <dl className="space-y-1.5 text-sm">
            <Row label={t("subtotal")} value={formatPrice(pricing.subtotal, currency)} />
            {pricing.discount > 0 && (
              <Row
                label={t("discount")}
                value={`− ${formatPrice(pricing.discount, currency)}`}
                tone="accent"
              />
            )}
            <Row
              label={`${pricing.taxLabel} (${Math.round(pricing.taxRate * 100)}%)`}
              value={formatPrice(pricing.tax, currency)}
            />
            <div className="flex items-center justify-between border-t border-line pt-2">
              <dt className="text-sm font-bold text-ink">{t("total")}</dt>
              <dd className="text-lg font-extrabold text-ink tabular-nums">
                {formatPrice(pricing.total, currency)}
              </dd>
            </div>
          </dl>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="md"
              onClick={onHold}
              className="flex-1"
            >
              <PauseCircle className="size-4.5" aria-hidden />
              {t("hold")}
            </Button>
            <Button size="md" onClick={onCharge} className="flex-[1.6]">
              {t("charge", { amount: formatPrice(pricing.total, currency) })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-body">{label}</dt>
      <dd
        className={cn(
          "font-semibold tabular-nums",
          tone === "accent" ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
