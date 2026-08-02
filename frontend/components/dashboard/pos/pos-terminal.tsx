"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ShoppingBag } from "lucide-react";
import type {
  FoodItem,
  PosDiscount,
  PosHeldTicket,
  PosOrderType,
  PosPayment,
  PosSale,
  PosTicketLine,
  RestaurantTable,
} from "@/types";
import type { MenuSectionWithItems } from "@/services/catalog";
import { getPosCatalog, getPosTables, completeSale } from "@/services/pos";
import type { CurrencyCode } from "@/config/regions";
import { formatPrice } from "@/lib/format";
import { computePosTotals, ticketCount } from "@/lib/pos";
import { useAuth } from "@/stores/auth";
import { useMerchant } from "@/stores/merchant";
import { usePos } from "@/stores/pos";
import { Modal } from "@/components/ui/modal";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { PosProductGrid } from "./pos-product-grid";
import { PosTicketPanel } from "./pos-ticket-panel";
import { PosChargeDialog } from "./pos-charge-dialog";
import { PosReceiptDialog } from "./pos-receipt-dialog";
import { PosHeldTicketsDialog } from "./pos-held-tickets-dialog";

/** Same calendar day, local time. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * PosTerminal — the POS Lite point of sale (Phase C11). Left: the sellable menu
 * grid. Right: the live ticket (order type + table, lines, discount, totals).
 * A ticket can be held/recalled (parked in the register store) or charged —
 * cash/card/wallet, all simulated — producing a persisted `PosSale` + receipt.
 * The current ticket is local component state; only held tickets and completed
 * sales survive a reload (via the persisted `usePos` register).
 */
export function PosTerminal() {
  const t = useTranslations("pos");
  const { vendor } = useDashboard();
  const currency = vendor.currency as CurrencyCode;
  const countryCode = vendor.location.countryCode;

  const cashierName = useAuth((s) => s.user?.name) ?? t("cashierFallback");

  const merchantUnavailable = useMerchant((s) => s.unavailable);
  const merchantHydrated = useMerchant((s) => s.hydrated);

  const sales = usePos((s) => s.sales);
  const heldTickets = usePos((s) => s.heldTickets);
  const posHydrated = usePos((s) => s.hydrated);
  const addSale = usePos((s) => s.addSale);
  const holdTicketStore = usePos((s) => s.holdTicket);
  const removeHeldTicket = usePos((s) => s.removeHeldTicket);

  // Remote data
  const [catalog, setCatalog] = useState<MenuSectionWithItems[] | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);

  // Current ticket (local session state)
  const [lines, setLines] = useState<PosTicketLine[]>([]);
  const [orderType, setOrderType] = useState<PosOrderType>("dine-in");
  const [tableId, setTableId] = useState<string | null>(null);
  const [discount, setDiscount] = useState<PosDiscount | null>(null);
  const [note, setNote] = useState("");

  // Dialogs
  const [chargeOpen, setChargeOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [receiptSale, setReceiptSale] = useState<PosSale | null>(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [mobileTicketOpen, setMobileTicketOpen] = useState(false);

  useEffect(() => {
    usePos.persist.rehydrate();
  }, []);

  useEffect(() => {
    let active = true;
    getPosCatalog(vendor.id).then((c) => active && setCatalog(c));
    getPosTables(vendor.id).then((tbls) => active && setTables(tbls));
    return () => {
      active = false;
    };
  }, [vendor.id]);

  const pricing = useMemo(
    () => computePosTotals({ lines, discount, currency, countryCode }),
    [lines, discount, currency, countryCode],
  );

  const unavailableIds = useMemo(
    () => new Set(merchantHydrated ? merchantUnavailable : []),
    [merchantUnavailable, merchantHydrated],
  );

  const tableLabel = tables.find((tbl) => tbl.id === tableId)?.label ?? null;

  const today = useMemo(() => {
    if (!posHydrated) return { count: 0, total: 0 };
    const now = new Date();
    const mine = sales.filter(
      (s) => s.vendorId === vendor.id && isSameDay(new Date(s.soldAt), now),
    );
    return {
      count: mine.length,
      total: mine.reduce((sum, s) => sum + s.pricing.total, 0),
    };
  }, [sales, posHydrated, vendor.id]);

  // ---- Ticket mutations -------------------------------------------------

  function addItem(item: FoodItem) {
    setLines((prev) => {
      const existing = prev.find((l) => l.id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.id === item.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          id: item.id,
          foodId: item.id,
          name: item.name,
          image: item.image,
          unitPrice: item.price,
          quantity: 1,
        },
      ];
    });
  }

  function setQty(lineId: string, next: number) {
    setLines((prev) =>
      next < 1
        ? prev.filter((l) => l.id !== lineId)
        : prev.map((l) => (l.id === lineId ? { ...l, quantity: next } : l)),
    );
  }

  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  function resetTicket() {
    setLines([]);
    setDiscount(null);
    setNote("");
    setTableId(null);
  }

  function makeHeld(): PosHeldTicket {
    return {
      id: `held_${Date.now().toString(36)}`,
      label: tableLabel ? t("tableShort", { label: tableLabel }) : t(`orderType.${orderType}`),
      orderType,
      tableId,
      lines,
      discount,
      note: note || null,
      heldAt: new Date().toISOString(),
    };
  }

  function holdCurrent() {
    if (lines.length === 0) return;
    holdTicketStore(makeHeld());
    toast.success(t("holdSuccess"));
    resetTicket();
    setMobileTicketOpen(false);
  }

  function recall(ticket: PosHeldTicket) {
    if (lines.length > 0) holdTicketStore(makeHeld());
    setLines(ticket.lines);
    setOrderType(ticket.orderType);
    setTableId(ticket.tableId);
    setDiscount(ticket.discount);
    setNote(ticket.note ?? "");
    removeHeldTicket(ticket.id);
    setHeldOpen(false);
    toast.success(t("recallSuccess"));
  }

  function openCharge() {
    if (lines.length === 0) return;
    setMobileTicketOpen(false);
    setChargeOpen(true);
  }

  async function confirmSale(payment: PosPayment) {
    setProcessing(true);
    const res = await completeSale({
      vendorId: vendor.id,
      orderType,
      tableLabel,
      lines,
      pricing,
      payment,
      cashierName,
    });
    setProcessing(false);

    if (res.error || !res.data) {
      toast.error(t(res.error ?? "saleFailed"));
      return;
    }

    addSale(res.data);
    setChargeOpen(false);
    setReceiptSale(res.data);
    resetTicket();
  }

  // ---- Ticket panel props (shared desktop + mobile) ---------------------

  const panelProps = {
    lines,
    pricing,
    currency,
    orderType,
    onOrderType: setOrderType,
    tables,
    tableId,
    onTable: setTableId,
    discount,
    onDiscount: setDiscount,
    note,
    onNote: setNote,
    onQty: setQty,
    onRemove: removeLine,
    onClear: () => {
      resetTicket();
      setMobileTicketOpen(false);
    },
    onHold: holdCurrent,
    onCharge: openCharge,
    heldCount: posHydrated ? heldTickets.length : 0,
    onOpenHeld: () => setHeldOpen(true),
  };

  const count = ticketCount(lines);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <div className="rounded-pill bg-fresh-50 px-3.5 py-1.5 text-sm font-semibold text-fresh-600 tabular-nums">
          {t("salesToday", { count: today.count })} · {formatPrice(today.total, currency)}
        </div>
      </header>

      {catalog === null ? (
        <PosSkeleton />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
          <PosProductGrid
            sections={catalog}
            currency={currency}
            unavailableIds={unavailableIds}
            onAdd={addItem}
          />
          <div className="hidden lg:sticky lg:top-20 lg:block">
            <PosTicketPanel {...panelProps} />
          </div>
        </div>
      )}

      {/* Mobile checkout bar */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileTicketOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-pill bg-primary px-5 py-3 text-white shadow-menu"
          >
            <span className="inline-flex items-center gap-2 text-sm font-bold">
              <ShoppingBag className="size-4.5" aria-hidden />
              {t("itemsCount", { count })}
            </span>
            <span className="text-sm font-extrabold tabular-nums">
              {formatPrice(pricing.total, currency)}
            </span>
          </button>
        </div>
      )}

      {/* Mobile ticket sheet */}
      <Modal
        open={mobileTicketOpen}
        onClose={() => setMobileTicketOpen(false)}
        className="sm:max-w-md lg:hidden"
      >
        <PosTicketPanel {...panelProps} />
      </Modal>

      <PosChargeDialog
        open={chargeOpen}
        onClose={() => setChargeOpen(false)}
        pricing={pricing}
        currency={currency}
        processing={processing}
        onConfirm={confirmSale}
      />

      <PosReceiptDialog
        sale={receiptSale}
        currency={currency}
        onNewSale={() => setReceiptSale(null)}
      />

      <PosHeldTicketsDialog
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        heldTickets={posHydrated ? heldTickets : []}
        currency={currency}
        onRecall={recall}
        onDiscard={removeHeldTicket}
      />
    </div>
  );
}

function PosSkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
      <div className="hidden h-96 animate-pulse rounded-panel bg-surface lg:block" />
    </div>
  );
}
