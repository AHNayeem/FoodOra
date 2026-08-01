"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChefHat, CookingPot, PackageCheck, ShoppingBag, Timer } from "lucide-react";
import type { Order, OrderStatus } from "@/types";
import { useOrders, ordersForVendor } from "@/stores/orders";
import { readyInMs, toMinutes } from "@/lib/order-lifecycle";
import { cn } from "@/lib/utils";
import { useDashboard } from "./dashboard-context";

const TICK_MS = 1000;

/**
 * The three kitchen columns and the state each holds. Confirmed orders are
 * "queued" — accepted, promised, not yet started — which is the distinction a
 * kitchen display exists to make.
 */
const COLUMNS: { key: string; status: OrderStatus; icon: typeof ChefHat }[] = [
  { key: "queued", status: "confirmed", icon: ChefHat },
  { key: "cooking", status: "preparing", icon: CookingPot },
  { key: "packing", status: "packing", icon: PackageCheck },
];

/** What each column's card advances to when tapped. */
const NEXT: Record<OrderStatus, OrderStatus> = {
  confirmed: "preparing",
  preparing: "packing",
  packing: "ready",
} as Record<OrderStatus, OrderStatus>;

/**
 * KitchenQueue — the pass (spec: Restaurant Dashboard → Kitchen Queue).
 *
 * The order board answers "what has come in and what do I owe the customer?";
 * this answers the only question a cook has: what is on, and what is late. So it
 * is three columns, sorted by how close each ticket is to its promise, with the
 * whole card as the advance button — nothing here should need a second tap or a
 * dialog while someone is holding a pan.
 *
 * It reads the same store as everything else, so a ticket moved here updates the
 * customer's progress bar and the order board at the same instant.
 */
export function KitchenQueue() {
  const t = useTranslations("dashboard");
  const { vendor } = useDashboard();

  const hydrated = useOrders((s) => s.hydrated);
  const allOrders = useOrders((s) => s.orders);
  const advance = useOrders((s) => s.advance);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    useOrders.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const orders = useMemo(
    () => ordersForVendor(allOrders, vendor.id),
    [allOrders, vendor.id],
  );

  /** Tickets in one column, most urgent first. */
  function column(status: OrderStatus): Order[] {
    return orders
      .filter((o) => o.status === status)
      .sort((a, b) => {
        const ra = readyInMs(a, now) ?? Number.MAX_SAFE_INTEGER;
        const rb = readyInMs(b, now) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
  }

  function push(order: Order) {
    const to = NEXT[order.status];
    if (!to) return;
    const result = advance(order.id, to, "restaurant");
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    toast.success(t("statusUpdated"));
  }

  if (!hydrated) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => (
          <div key={c.key} className="h-64 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  const ready = orders.filter((o) => o.status === "ready");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h2 text-ink">{t("kitchenTitle")}</h1>
        <p className="text-sm text-muted">{t("kitchenSubtitle")}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map(({ key, status, icon: Icon }) => {
          const tickets = column(status);
          return (
            <section
              key={key}
              className="flex flex-col rounded-card border border-line bg-surface-alt p-3"
            >
              <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold text-ink">
                <Icon className="size-4 text-muted" aria-hidden />
                {t(`kitchen.${key}`)}
                <span className="ms-auto rounded-pill bg-surface px-2 py-0.5 text-xs tabular-nums text-muted">
                  {tickets.length}
                </span>
              </h2>

              {tickets.length === 0 ? (
                <p className="rounded-field border border-dashed border-line py-8 text-center text-xs text-muted">
                  {t("kitchenEmpty")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {tickets.map((order) => (
                    <Ticket
                      key={order.id}
                      order={order}
                      now={now}
                      onAdvance={() => push(order)}
                      advanceLabel={t(`kitchenAdvance.${key}`)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {/* The pass — done, waiting to leave. */}
      <section className="rounded-card border border-fresh/30 bg-fresh/5 p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <ShoppingBag className="size-4 text-fresh-600" aria-hidden />
          {t("kitchen.pass")}
          <span className="ms-auto rounded-pill bg-surface px-2 py-0.5 text-xs tabular-nums text-muted">
            {ready.length}
          </span>
        </h2>
        {ready.length === 0 ? (
          <p className="mt-3 text-xs text-muted">{t("kitchenPassEmpty")}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {ready.map((order) => (
              <li
                key={order.id}
                className="rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
              >
                {order.orderNumber} · {order.contact.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** One ticket. The whole card advances it — a kitchen display has no fine motor. */
function Ticket({
  order,
  now,
  onAdvance,
  advanceLabel,
}: {
  order: Order;
  now: number;
  onAdvance: () => void;
  advanceLabel: string;
}) {
  const t = useTranslations("dashboard");
  const remaining = readyInMs(order, now);
  const overdue = remaining != null && remaining < 0;
  const urgent = remaining != null && remaining >= 0 && remaining < 5 * 60_000;

  return (
    <li>
      <button
        type="button"
        onClick={onAdvance}
        className={cn(
          "w-full rounded-field border-2 bg-surface p-3 text-start transition-colors hover:border-primary",
          overdue ? "border-danger/60" : urgent ? "border-accent/60" : "border-line",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-bold text-ink">{order.orderNumber}</span>
          {remaining != null && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-bold tabular-nums",
                overdue ? "text-danger" : urgent ? "text-accent-600" : "text-muted",
              )}
            >
              <Timer className="size-3.5" aria-hidden />
              {overdue
                ? t("overdueBy", { minutes: toMinutes(-remaining) })
                : t("readyInShort", { minutes: toMinutes(remaining) })}
            </span>
          )}
        </div>

        <ul className="mt-2 space-y-0.5 text-sm text-body">
          {order.lines.map((line) => (
            <li key={line.id} className="truncate">
              <span className="font-bold text-ink tabular-nums">{line.quantity}×</span>{" "}
              {line.name}
            </li>
          ))}
        </ul>

        {order.notes && (
          <p className="mt-2 truncate rounded-field bg-accent-50 px-2 py-1 text-xs text-accent-600">
            {order.notes}
          </p>
        )}

        <span className="mt-2 block text-xs font-bold text-primary">{advanceLabel} →</span>
      </button>
    </li>
  );
}
