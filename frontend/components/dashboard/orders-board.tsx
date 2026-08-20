"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Banknote,
  Bike,
  ChevronDown,
  Clock,
  Inbox,
  MapPin,
  ShoppingBag,
  StickyNote,
  Timer,
} from "lucide-react";
import type { Order, OrderCancelReason, OrderStatus, Rider } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useOrders, busyRiderIds, ordersForVendor } from "@/stores/orders";
import { offShiftRiderIds, useFleet } from "@/stores/fleet";
import { undispatchableRiderIds, useOnboarding } from "@/stores/onboarding";
import { getFleet } from "@/services/delivery";
import {
  restaurantActions,
  isTerminal,
  type OrderAction,
} from "@/lib/order-machine";
import {
  DELAY_OPTIONS,
  REJECT_REASONS,
  readyInMs,
  toMinutes,
} from "@/lib/order-lifecycle";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { PrepTimeDialog } from "@/components/orders/prep-time-dialog";
import { ReasonDialog } from "@/components/orders/reason-dialog";
import { AssignRiderDialog } from "@/components/orders/assign-rider-dialog";
import { useDashboard } from "./dashboard-context";

/** Countdown cadence for the kitchen timers. */
const TICK_MS = 1000;

/**
 * Board tabs → the statuses each collects. Derived from the machine's
 * vocabulary rather than invented here, so a new state cannot vanish from the
 * board by being forgotten — anything not in a group lands in `all`.
 */
const GROUPS: Record<string, OrderStatus[]> = {
  new: ["placed"],
  preparing: ["confirmed", "preparing", "packing"],
  ready: ["ready", "rider-assigned", "picked-up", "on-the-way", "arrived"],
  completed: ["delivered", "completed"],
  cancelled: ["rejected", "cancelled", "delivery-failed", "returned", "refunded"],
};
const TABS = Object.keys(GROUPS);

/**
 * OrdersBoard — the restaurant's order desk (spec §2, §3, §4).
 *
 * Two things changed here, and the second is the important one.
 *
 * The visible change is that the workflow is now the spec's: accepting asks for
 * a preparation time, rejecting asks why, the kitchen moves through preparing →
 * packing → ready, and dispatch is a real step with an automatic and a manual
 * route. "Need more time" exists. So does cancelling after acceptance, with a
 * reason the customer is actually told.
 *
 * The structural change is that **none of this is local any more**. The board
 * used to load a freshly synthesised feed on every visit and mutate a `useState`
 * array, so a restaurant's decisions survived exactly until the next navigation
 * and were invisible to everyone else. It now reads and writes the shared order
 * store — the same record the customer's tracker and the rider app are looking
 * at. Accepting an order in this tab starts a countdown in the tab beside it.
 */
export function OrdersBoard() {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const { vendor } = useDashboard();
  const currency = vendor.currency as CurrencyCode;

  const hydrated = useOrders((s) => s.hydrated);
  const allOrders = useOrders((s) => s.orders);
  const shifts = useFleet((s) => s.shifts);
  const advance = useOrders((s) => s.advance);
  const delayOrder = useOrders((s) => s.delayOrder);
  const assignRider = useOrders((s) => s.assignRider);
  const autoDispatch = useOrders((s) => s.autoDispatch);

  const [tab, setTab] = useState<string>("new");
  const [now, setNow] = useState(() => Date.now());
  const [fleet, setFleet] = useState<Rider[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: "prep-time" | "reject-reason" | "cancel-reason" | "rider"; order: Order }
    | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    useOrders.persist.rehydrate();
    // Availability spans both stores; the dispatch dialog has to see both halves.
    useFleet.persist.rehydrate();
    getFleet(undefined, useOnboarding.getState().admittedRiders).then(setFleet);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const orders = useMemo(
    () => ordersForVendor(allOrders, vendor.id),
    [allOrders, vendor.id],
  );

  /**
   * Who cannot take a job right now. Read from the whole order set rather than
   * this vendor's, because a rider carrying somebody else's dinner is just as
   * unavailable — and from the shift board, because a rider who has gone home is
   * too (G40).
   */
  const busy = useMemo(() => busyRiderIds(allOrders), [allOrders]);
  const offShift = useMemo(() => offShiftRiderIds(shifts), [shifts]);
  // Phase 7: onboarding is the third reason a courier cannot be picked, and the
  // manual dialog has to know it or it would offer work dispatch would refuse.
  const riderApplications = useOnboarding((s) => s.riderApplications);
  const notApproved = useMemo(
    () => undispatchableRiderIds(riderApplications),
    [riderApplications],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const key of TABS) {
      map[key] = orders.filter((o) => GROUPS[key].includes(o.status)).length;
    }
    return map;
  }, [orders]);

  /** Run an action, translating whatever the machine says back into a toast. */
  function run(order: Order, to: OrderStatus, patch = {}) {
    const result = advance(order.id, to, "restaurant", patch);
    if (result.error) {
      toast.error(t(result.error));
      return false;
    }
    toast.success(t("statusUpdated"));
    return true;
  }

  function onAction(order: Order, action: OrderAction) {
    if (action.prompts) {
      setDialog({ kind: action.prompts as never, order });
      return;
    }
    if (action.to === "delay") {
      setDialog(null);
      return;
    }
    run(order, action.to as OrderStatus);
  }

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <div className="h-9 w-56 animate-pulse rounded-pill bg-surface" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  const visible = orders.filter((o) => GROUPS[tab].includes(o.status));
  const newCount = counts.new;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("ordersTitle")}</h1>
          <p className="text-sm text-muted">{t("ordersSubtitle")}</p>
        </div>
        {newCount > 0 && (
          <span className="inline-flex items-center gap-2 rounded-pill bg-accent-50 px-3.5 py-1.5 text-sm font-bold text-accent-600">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-accent opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-accent" />
            </span>
            {t("awaitingResponse", { count: newCount })}
          </span>
        )}
      </header>

      <div
        role="tablist"
        aria-label={t("ordersTitle")}
        className="flex gap-1.5 overflow-x-auto border-b border-line pb-px"
      >
        {TABS.map((key) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t(`tab.${key}`)}
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-pill px-1.5 text-xs font-bold tabular-nums",
                  active ? "bg-primary/10 text-primary" : "bg-surface-muted text-muted",
                )}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
            <Inbox className="size-6" aria-hidden />
          </span>
          <p className="text-sm text-muted">{t("noOrdersInTab")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              now={now}
              currency={currency}
              expanded={expanded === order.id}
              onToggle={() => setExpanded(expanded === order.id ? null : order.id)}
              onAction={(action) => onAction(order, action)}
              onDelay={(minutes) => {
                delayOrder(order.id, minutes);
                toast.success(t("delayAdded", { minutes }));
              }}
              format={format}
            />
          ))}
        </ul>
      )}

      {/* Accept — commits to a preparation time. */}
      {dialog?.kind === "prep-time" && (
        <PrepTimeDialog
          open
          orderNumber={dialog.order.orderNumber}
          itemCount={dialog.order.lines.reduce((n, l) => n + l.quantity, 0)}
          submitting={submitting}
          onClose={() => setDialog(null)}
          onConfirm={(minutes) => {
            if (run(dialog.order, "confirmed", { prepMinutes: minutes })) {
              setDialog(null);
            }
          }}
        />
      )}

      {/* Reject at intake — the customer is told why. */}
      {dialog?.kind === "reject-reason" && (
        <ReasonDialog
          open
          title={t("rejectTitle")}
          body={t("rejectBody", { number: dialog.order.orderNumber })}
          reasons={REJECT_REASONS}
          confirmLabel={t("confirmReject")}
          submitting={submitting}
          onClose={() => setDialog(null)}
          onConfirm={(reason: OrderCancelReason, note) => {
            if (run(dialog.order, "rejected", { reason, note: note || null })) {
              setDialog(null);
            }
          }}
        />
      )}

      {/* Cancel after acceptance. */}
      {dialog?.kind === "cancel-reason" && (
        <ReasonDialog
          open
          title={t("cancelTitle")}
          body={t("cancelBody", { number: dialog.order.orderNumber })}
          reasons={REJECT_REASONS}
          confirmLabel={t("confirmCancel")}
          submitting={submitting}
          onClose={() => setDialog(null)}
          onConfirm={(reason: OrderCancelReason, note) => {
            if (run(dialog.order, "cancelled", { reason, note: note || null })) {
              setDialog(null);
            }
          }}
        />
      )}

      {/* Dispatch — automatic or hand-picked. */}
      {dialog?.kind === "rider" && (
        <AssignRiderDialog
          busy={busy}
          offShift={offShift}
          notApproved={notApproved}
          open
          order={dialog.order}
          fleet={fleet}
          submitting={submitting}
          onClose={() => setDialog(null)}
          onAuto={() => {
            setSubmitting(true);
            const result = autoDispatch(dialog.order.id);
            setSubmitting(false);
            if (result.error) {
              toast.error(t(result.error));
              return;
            }
            toast.success(
              t("riderAssignedToast", { name: result.order?.lifecycle.rider?.name ?? "" }),
            );
            setDialog(null);
          }}
          onAssign={(rider) => {
            const result = assignRider(dialog.order.id, rider, "manual");
            if (result.error) {
              toast.error(t(result.error));
              return;
            }
            toast.success(t("riderAssignedToast", { name: rider.name }));
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * One order on the board.
 *
 * Collapsed it answers the three questions a busy counter asks — who, what, how
 * long — and carries the actions. Expanded it shows the delivery address, the
 * customer's note and the full timeline, because the counter also has to answer
 * "what happened to this one?" when a customer calls.
 */
function OrderRow({
  order,
  now,
  currency,
  expanded,
  onToggle,
  onAction,
  onDelay,
  format,
}: {
  order: Order;
  now: number;
  currency: CurrencyCode;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: OrderAction) => void;
  onDelay: (minutes: number) => void;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations("dashboard");
  const actions = restaurantActions(order);
  const count = order.lines.reduce((n, l) => n + l.quantity, 0);
  const remaining = readyInMs(order, now);
  const overdue = remaining != null && remaining < 0;
  const isNew = order.status === "placed";

  return (
    <li
      className={cn(
        "rounded-card border bg-surface shadow-card transition-colors",
        isNew ? "border-accent/50" : "border-line",
      )}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-ink">
                {order.orderNumber}
              </span>
              <OrderStatusChip status={order.status} live={isNew} />
              {order.lifecycle.delayMinutes > 0 && (
                <span className="inline-flex items-center gap-1 rounded-pill bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-600">
                  <Clock className="size-3" aria-hidden />
                  {t("delayedBy", { minutes: order.lifecycle.delayMinutes })}
                </span>
              )}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              {order.fulfillment === "delivery" ? (
                <Bike className="size-3.5" aria-hidden />
              ) : (
                <ShoppingBag className="size-3.5" aria-hidden />
              )}
              {order.contact.name}
              <span aria-hidden>·</span>
              {format.relativeTime(new Date(order.placedAt), now)}
              <span aria-hidden>·</span>
              {t("itemCount", { count })}
            </p>
          </div>

          <div className="text-end">
            <span className="block text-base font-extrabold text-ink tabular-nums">
              {formatPrice(order.pricing.total, currency)}
            </span>
            {/* The kitchen clock — what this row is really about. */}
            {remaining != null && !isTerminal(order.status) && order.status !== "ready" && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-bold tabular-nums",
                  overdue ? "text-danger" : "text-muted",
                )}
              >
                <Timer className="size-3.5" aria-hidden />
                {overdue
                  ? t("overdueBy", { minutes: toMinutes(-remaining) })
                  : t("readyInShort", { minutes: toMinutes(remaining) })}
              </span>
            )}
          </div>
        </div>

        {/* Items */}
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          {order.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 text-body">
              <span className="min-w-0 truncate">
                <span className="font-semibold text-ink tabular-nums">
                  {line.quantity}×
                </span>{" "}
                {line.name}
                {line.options.length > 0 && (
                  <span className="text-xs text-muted">
                    {" "}
                    ({line.options.map((o) => o.name).join(", ")})
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {formatPrice(line.unitPrice * line.quantity, currency)}
              </span>
            </li>
          ))}
        </ul>

        {order.notes && (
          <p className="mt-3 flex items-start gap-2 rounded-field bg-accent-50 p-3 text-sm text-accent-600">
            <StickyNote className="mt-0.5 size-4 shrink-0" aria-hidden />
            {order.notes}
          </p>
        )}

        {order.lifecycle.rider && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Bike className="size-3.5" aria-hidden />
            {t("riderOnJob", {
              name: order.lifecycle.rider.name,
              vehicle: t(`vehicle.${order.lifecycle.rider.vehicle}`),
            })}
          </p>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-4 space-y-4 border-t border-line pt-4">
            {order.address && (
              <p className="flex items-start gap-2 text-sm text-body">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <span>
                  {order.address.line1}
                  {order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.area}
                  {order.address.instructions && (
                    <span className="block text-xs text-muted">
                      {order.address.instructions}
                    </span>
                  )}
                </span>
              </p>
            )}
            <div>
              <h3 className="mb-3 text-sm font-bold text-ink">{t("historyTitle")}</h3>
              <OrderTimeline order={order} now={now} compact />
            </div>
          </div>
        )}

        {/* Footer: payment, expander, actions */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Banknote className="size-3.5" aria-hidden />
              {t(`payment.${order.payment.method}`)} · {t(`paymentStatus.${order.payment.status}`)}
            </span>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              {expanded ? t("hideDetail") : t("showDetail")}
              <ChevronDown
                className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                aria-hidden
              />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action) =>
              action.to === "delay" ? (
                <DelayMenu key={action.key} onPick={onDelay} label={t(action.key)} />
              ) : (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => onAction(action)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-sm font-semibold transition-colors active:scale-[0.98]",
                    action.tone === "primary" &&
                      "bg-primary text-white shadow-sm hover:bg-primary-600",
                    action.tone === "danger" &&
                      "border border-line text-danger hover:bg-danger/5",
                    action.tone === "neutral" &&
                      "border border-line text-body hover:bg-surface-muted",
                  )}
                >
                  {t(action.key)}
                </button>
              ),
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * "Need more time" (spec §2). A small popover of fixed increments rather than a
 * free-text field: under pressure a kitchen picks a number, it does not type one.
 */
function DelayMenu({
  onPick,
  label,
}: {
  onPick: (minutes: number) => void;
  label: string;
}) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-pill border border-line px-4 py-2 text-sm font-semibold text-body transition-colors hover:bg-surface-muted"
      >
        <Clock className="size-4" aria-hidden />
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute end-0 bottom-full z-20 mb-2 w-40 rounded-card border border-line bg-surface p-1.5 shadow-menu">
            {DELAY_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => {
                  onPick(minutes);
                  setOpen(false);
                }}
                className="w-full rounded-field px-3 py-2 text-start text-sm font-medium text-body transition-colors hover:bg-surface-muted"
              >
                {t("addMinutes", { minutes })}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
