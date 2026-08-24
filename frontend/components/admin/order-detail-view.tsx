"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Bike,
  MapPin,
  PackageX,
  Phone,
  Receipt,
  ShieldCheck,
  StickyNote,
  Store,
  User as UserIcon,
  Wallet,
} from "lucide-react";
import type { OrderCancelReason, OrderStatus, Rider } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useOrders, busyRiderIds } from "@/stores/orders";
import { offShiftRiderIds, useFleet } from "@/stores/fleet";
import { undispatchableRiderIds, useOnboarding } from "@/stores/onboarding";
import { getFleet, jobForOrder } from "@/services/delivery";
import { zoneById, zoneIdForArea } from "@/lib/mock";
import {
  adminActions,
  cashDueOn,
  isOtpLocked,
  isTerminal,
  OTP_MAX_ATTEMPTS,
  type OrderAction,
} from "@/lib/order-machine";
import {
  DELIVERY_FAIL_REASONS,
  REJECT_REASONS,
  stuckReason,
} from "@/lib/order-lifecycle";
import { cartCount } from "@/lib/cart";
import { formatDistance, formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { PrepTimeDialog } from "@/components/orders/prep-time-dialog";
import { ReasonDialog } from "@/components/orders/reason-dialog";
import { AssignRiderDialog } from "@/components/orders/assign-rider-dialog";
import { HandoverDialog } from "@/components/orders/handover-dialog";
import { PayoutBreakdown } from "@/components/rider/payout-breakdown";
import { RefundControls } from "@/components/admin/refund-controls";
import { cn } from "@/lib/utils";

const TICK_MS = 5000;

/** What the intervention controls have open, and on which order. */
type Dialog =
  | { kind: "prep-time" }
  | { kind: "reject-reason" }
  | { kind: "cancel-reason" }
  | { kind: "fail-reason" }
  | { kind: "rider"; reassign: boolean }
  | { kind: "cash"; to: OrderStatus }
  | { kind: "handover" }
  | { kind: "confirm"; to: OrderStatus };

/**
 * AdminOrderDetail — one order, everything about it, and the controls to
 * intervene (Phase 4, G06).
 *
 * This is the surface the gap analysis found missing entirely: the admin had a
 * board with no buttons on it, so "admin can intervene" was a claim with no code
 * behind it. Every control here is a *transition*, taken from
 * `order-machine.adminActions` — which is `TRANSITIONS[status]` with the guarded
 * moves labelled with what they need collecting. Nothing writes a field on the
 * order, nothing switches on the status to decide what is offered, and a
 * transition the machine would refuse is not rendered.
 *
 * The panels are inspection, in the order a support call needs them: who is
 * involved, then the money, then the delivery, then the history. Each one reads
 * records that already exist — `lifecycle.financials` (Phase 2), `jobForOrder`
 * (Phase 3), the event log — so nothing on this page is computed twice or
 * invented where a record is absent. An order that has not completed says its
 * books are not worked out yet rather than showing a projection.
 */
export function AdminOrderDetail({ orderId }: { orderId: string }) {
  const t = useTranslations("admin");
  const to = useTranslations("order");
  const td = useTranslations("dashboard");
  const format = useFormatter();
  const locale = useLocale();

  const hydrated = useOrders((s) => s.hydrated);
  const order = useOrders((s) => s.orders.find((o) => o.id === orderId));
  const allOrders = useOrders((s) => s.orders);
  const shifts = useFleet((s) => s.shifts);
  const advance = useOrders((s) => s.advance);
  const assignRider = useOrders((s) => s.assignRider);
  const reassignRider = useOrders((s) => s.reassignRider);
  const autoDispatch = useOrders((s) => s.autoDispatch);
  const failHandover = useOrders((s) => s.failHandover);

  const [now, setNow] = useState(() => Date.now());
  const [fleet, setFleet] = useState<Rider[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  /**
   * The counter check's last refusal (Phase 10, G22). Held separately from the
   * toast the other refusals use, because a wrong code is answered *inside* the
   * dialog — the operator has to be able to try again without reopening it.
   */
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    useOrders.persist.rehydrate();
    useFleet.persist.rehydrate();
    getFleet(undefined, useOnboarding.getState().admittedRiders).then(setFleet);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const busy = useMemo(() => busyRiderIds(allOrders), [allOrders]);
  const offShift = useMemo(() => offShiftRiderIds(shifts), [shifts]);
  // Phase 7: onboarding is the third reason a courier cannot be picked, and the
  // manual dialog has to know it or it would offer work dispatch would refuse.
  const riderApplications = useOnboarding((s) => s.riderApplications);
  const notApproved = useMemo(
    () => undispatchableRiderIds(riderApplications),
    [riderApplications],
  );

  /**
   * The delivery as the rider app sees it — route, stops, distance and payout.
   * Derived from the order on demand (Phase 3's bridge), so it cannot disagree
   * with the trip the courier is actually running.
   */
  const job = useMemo(() => (order ? jobForOrder(order, now) : null), [order, now]);

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-pill bg-surface" />
        <div className="h-40 animate-pulse rounded-card bg-surface" />
        <div className="h-96 animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
          <PackageX className="size-6" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-ink">{to("notFound")}</p>
        <Button href="/admin/orders" variant="outline" size="sm">
          {t("backToOrders")}
        </Button>
      </div>
    );
  }

  const currency = order.pricing.currency as CurrencyCode;
  const actions = adminActions(order);
  const stuck = stuckReason(order, now);
  const rider = order.lifecycle.rider;
  const zone = zoneById.get(zoneIdForArea(order.address?.area) ?? "");
  const cashDue = cashDueOn(order);
  const financials = order.lifecycle.financials;

  /** Commit a transition as `admin` and report whatever the machine says. */
  function run(target: OrderStatus, patch: Record<string, unknown> = {}): boolean {
    setSubmitting(true);
    const result = advance(orderId, target, "admin", patch);
    setSubmitting(false);
    if (result.error) {
      toast.error(t(result.error));
      return false;
    }
    toast.success(t("interveneDone", { status: to(`status.${target}`) }));
    setDialog(null);
    return true;
  }

  function onAction(action: OrderAction) {
    const target = action.to as OrderStatus;
    switch (action.prompts) {
      case "prep-time":
        return setDialog({ kind: "prep-time" });
      case "reject-reason":
        return setDialog({ kind: "reject-reason" });
      case "cancel-reason":
        return setDialog({ kind: "cancel-reason" });
      case "fail-reason":
        return setDialog({ kind: "fail-reason" });
      case "rider":
        return setDialog({ kind: "rider", reassign: false });
      case "cash":
        return setDialog({ kind: "cash", to: target });
      case "handover":
        setHandoverError(null);
        return setDialog({ kind: "handover" });
      case "confirm":
        return setDialog({ kind: "confirm", to: target });
      default:
        run(target);
    }
  }

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-5">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("backToOrders")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-h2 text-ink">{order.orderNumber}</h1>
            <OrderStatusChip status={order.status} />
            {stuck && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-danger/10 px-2.5 py-1 text-xs font-bold text-danger">
                <AlertTriangle className="size-3.5" aria-hidden />
                {t(stuck.key, { minutes: stuck.minutes })}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {t("placedAt", { time: fmtDateTime(order.placedAt) })} ·{" "}
            {format.relativeTime(new Date(order.placedAt), now)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button href={`/orders/${order.id}`} variant="outline" size="sm">
            {t("viewAsCustomer")}
          </Button>
          <Button href={`/checkout/success?order=${order.id}`} variant="ghost" size="sm">
            <Receipt className="size-4" aria-hidden />
            {t("viewInvoice")}
          </Button>
        </div>
      </header>

      {/* Intervention — the graph, as buttons. */}
      <section className="rounded-card border border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-h3 text-ink">{t("interveneTitle")}</h2>
          <p className="text-xs text-muted">{t("interveneHint")}</p>
        </div>
        {actions.length === 0 ? (
          <p className="mt-3 rounded-field bg-surface p-3 text-sm text-muted">
            {isTerminal(order.status) ? t("interveneTerminal") : t("interveneNone")}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.to}
                type="button"
                disabled={submitting}
                onClick={() => onAction(action)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-sm font-semibold transition-colors active:scale-[0.98] disabled:opacity-50",
                  action.tone === "primary" && "bg-primary text-white hover:bg-primary-600",
                  action.tone === "danger" &&
                    "border border-danger/40 bg-surface text-danger hover:bg-danger/5",
                  action.tone === "neutral" &&
                    "border border-line bg-surface text-body hover:bg-surface-muted",
                )}
              >
                {t("moveTo", { status: to(`status.${action.to}`) })}
              </button>
            ))}
          </div>
        )}
        {/* Reassignment is not a status change, so it is not in the action list —
            it is two of them (see `stores/orders.reassignRider`). Offered only
            while it is actually possible: before the courier has the food. */}
        {order.status === "rider-assigned" && (
          <div className="mt-3 border-t border-primary/20 pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => setDialog({ kind: "rider", reassign: true })}
            >
              <Bike className="size-4" aria-hidden />
              {t("reassignRider")}
            </Button>
            <p className="mt-1.5 text-xs text-muted">{t("reassignHint")}</p>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Customer */}
        <Panel title={t("panelCustomer")} icon={UserIcon}>
          <Row label={t("fieldName")} value={order.contact.name} />
          <Row label={t("fieldPhone")} value={order.contact.phone} mono />
          <Row
            label={t("fieldFulfillment")}
            value={t(`fulfillment.${order.fulfillment}`)}
          />
          {order.notes && (
            <p className="mt-2 flex items-start gap-2 rounded-field bg-accent-50 p-2.5 text-xs text-accent-600">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {order.notes}
            </p>
          )}
        </Panel>

        {/* Restaurant */}
        <Panel title={t("panelRestaurant")} icon={Store}>
          <Row
            label={t("fieldName")}
            value={
              <Link
                href={`/restaurants/${order.vendor.slug}`}
                className="font-semibold text-primary hover:underline"
              >
                {order.vendor.name}
              </Link>
            }
          />
          <Row
            label={t("fieldCommissionRate")}
            value={`${(order.commissionRate * 100).toFixed(1)}%`}
          />
          {order.lifecycle.prepMinutes != null && (
            <Row
              label={t("fieldPromisedPrep")}
              value={t("minutesValue", { minutes: order.lifecycle.prepMinutes })}
            />
          )}
          {order.lifecycle.delayMinutes > 0 && (
            <Row
              label={t("fieldDelay")}
              value={t("minutesValue", { minutes: order.lifecycle.delayMinutes })}
              tone="danger"
            />
          )}
          {order.lifecycle.promisedReadyAt && (
            <Row
              label={t("fieldPromisedReady")}
              value={fmtDateTime(order.lifecycle.promisedReadyAt)}
            />
          )}
        </Panel>

        {/* Payment */}
        <Panel title={t("panelPayment")} icon={Wallet}>
          <Row
            label={t("fieldMethod")}
            value={to(`payment.${order.payment.method}`, {
              last4: order.payment.cardLast4 ?? "",
            })}
          />
          <Row
            label={t("fieldPaymentStatus")}
            value={to(`paymentStatus.${order.payment.status}`)}
            tone={order.payment.status === "paid" ? "fresh" : undefined}
          />
          <Row
            label={t("fieldOrderTotal")}
            value={formatPrice(order.pricing.total, currency)}
          />
          {cashDue > 0 && (
            <Row
              label={t("fieldCashDue")}
              value={formatPrice(cashDue, currency)}
              tone="danger"
            />
          )}
        </Panel>

        {/* The refund, with its decisions — the same component the support desk
            uses, writing to the same store, so a refund granted from a ticket and
            one granted here are one record (Phase 5, G07). */}
        <RefundControls order={order} />

        {/* Delivery */}
        <Panel title={t("panelDelivery")} icon={MapPin}>
          {order.address ? (
            <>
              <Row
                label={t("fieldAddress")}
                value={`${order.address.line1}${
                  order.address.line2 ? `, ${order.address.line2}` : ""
                }, ${order.address.area}`}
              />
              <Row label={t("fieldRecipient")} value={order.address.recipient} />
              {order.address.instructions && (
                <Row label={t("fieldInstructions")} value={order.address.instructions} />
              )}
            </>
          ) : (
            <p className="text-xs text-muted">{t("deliveryPickupNote")}</p>
          )}
          {zone && <Row label={t("fieldZone")} value={zone.name} />}
          {order.fulfillment === "delivery" && (
            <>
              <Row
                label={t("fieldOtp")}
                value={
                  <span className="font-mono font-bold tracking-widest">
                    {order.lifecycle.otp}
                  </span>
                }
              />
              <Row
                label={t("fieldOtpAttempts")}
                value={`${order.lifecycle.otpAttempts}/${OTP_MAX_ATTEMPTS}`}
                tone={isOtpLocked(order) ? "danger" : undefined}
              />
              {order.lifecycle.otpVerifiedAt && (
                <Row
                  label={t("fieldOtpVerified")}
                  value={fmtDateTime(order.lifecycle.otpVerifiedAt)}
                  tone="fresh"
                />
              )}
            </>
          )}
          {order.lifecycle.failureReason && (
            <Row
              label={t("fieldFailureReason")}
              value={to(`reason.${order.lifecycle.failureReason}`)}
              tone="danger"
            />
          )}
          {(order.lifecycle.cancelReason || order.lifecycle.rejectionReason) && (
            <Row
              label={t("fieldEndReason")}
              value={to(
                `reason.${order.lifecycle.cancelReason ?? order.lifecycle.rejectionReason}`,
              )}
              tone="danger"
            />
          )}
        </Panel>

        {/* Rider + trip */}
        <Panel title={t("panelRider")} icon={Bike}>
          {rider ? (
            <>
              <Row label={t("fieldName")} value={rider.name} />
              <Row
                label={t("fieldPhone")}
                value={
                  <a
                    href={`tel:${rider.phone}`}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    <Phone className="size-3.5" aria-hidden />
                    {rider.phone}
                  </a>
                }
              />
              <Row label={t("fieldVehicle")} value={td(`vehicle.${rider.vehicle}`)} />
              {rider.plate && <Row label={t("fieldPlate")} value={rider.plate} mono />}
              <Row
                label={t("fieldRiderRating")}
                value={`${rider.rating.toFixed(1)} · ${td("tripsCount", { count: rider.trips })}`}
              />
              <Row
                label={t("fieldAssignment")}
                value={t(`assignment.${order.lifecycle.assignment ?? "manual"}`)}
              />
              {order.lifecycle.assignedAt && (
                <Row
                  label={t("fieldAssignedAt")}
                  value={fmtDateTime(order.lifecycle.assignedAt)}
                />
              )}
            </>
          ) : (
            <p className="text-xs text-muted">
              {order.fulfillment === "delivery" ? t("riderNone") : t("riderNotNeeded")}
            </p>
          )}

          {order.lifecycle.rejectedRiderIds.length > 0 && (
            <Row
              label={t("fieldHandedBack")}
              value={String(order.lifecycle.rejectedRiderIds.length)}
              tone="danger"
            />
          )}

          {job && (
            <div className="mt-3 border-t border-line pt-3">
              <Row label={t("fieldTrip")} value={job.jobNumber} mono />
              <Row label={t("fieldDistance")} value={formatDistance(job.distanceKm)} />
              <Row
                label={t("fieldStops")}
                value={t("stopsDone", {
                  done: job.completedStopIds.length,
                  total: job.stops.length,
                })}
              />
              <PayoutBreakdown
                payout={job.payout}
                cashCollected={job.cashToCollect}
                className="mt-3"
              />
            </div>
          )}
        </Panel>

        {/* Money */}
        <Panel title={t("panelMoney")} icon={Banknote}>
          {financials ? (
            <>
              <Row
                label={t("moneyGross")}
                value={formatPrice(financials.commission.grossAmount, currency)}
              />
              <Row
                label={t("moneyCommissionable")}
                value={formatPrice(financials.commission.commissionableAmount, currency)}
              />
              <Row
                label={t("moneyCommissionAt", {
                  percent: (financials.commission.rate * 100).toFixed(1),
                })}
                value={formatPrice(financials.commission.commissionAmount, currency)}
                tone="primary"
              />
              <Row
                label={t("moneyVendorNet")}
                value={formatPrice(financials.commission.vendorNetAmount, currency)}
              />
              <Row
                label={t("moneyDeliveryFee")}
                value={formatPrice(financials.commission.deliveryFee, currency)}
              />
              <Row
                label={t("moneyTax")}
                value={formatPrice(financials.commission.tax, currency)}
              />
              <Row
                label={t("moneyTip")}
                value={formatPrice(financials.commission.tip, currency)}
              />
              <Row
                label={t("moneyPlatform")}
                value={formatPrice(financials.commission.platformAmount, currency)}
                tone="primary"
              />
              <Row label={t("moneySettlement")} value={financials.settlementRef} mono />
              <Row label={t("moneySettledAt")} value={fmtDateTime(financials.settledAt)} />
              {financials.riderEarning && (
                <Row
                  label={t("moneyRiderPayout", { name: financials.riderEarning.riderName })}
                  value={formatPrice(financials.riderEarning.payout.total, currency)}
                />
              )}
            </>
          ) : (
            <>
              {/* No projection: what the platform will take is decided by the
                  transition that completes the order, and inventing the number
                  here would be a financial value with nothing behind it. */}
              <p className="rounded-field bg-surface-muted p-2.5 text-xs text-muted">
                {t("moneyUnsettled")}
              </p>
              <div className="mt-2">
                <Row
                  label={t("moneySubtotal")}
                  value={formatPrice(order.pricing.subtotal, currency)}
                />
                {order.pricing.discount > 0 && (
                  <Row
                    label={t("moneyDiscount")}
                    value={`−${formatPrice(order.pricing.discount, currency)}`}
                  />
                )}
                <Row
                  label={t("moneyDeliveryFee")}
                  value={formatPrice(order.pricing.deliveryFee, currency)}
                />
                <Row
                  label={t("moneyTax")}
                  value={formatPrice(order.pricing.tax, currency)}
                />
                {order.pricing.tip > 0 && (
                  <Row
                    label={t("moneyTip")}
                    value={formatPrice(order.pricing.tip, currency)}
                  />
                )}
                <Row
                  label={t("moneyAgreedRate")}
                  value={`${(order.commissionRate * 100).toFixed(1)}%`}
                />
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* Items */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-h3 text-ink">
          {t("panelItems", { count: cartCount(order.lines) })}
        </h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {order.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 text-body">
              <span className="min-w-0">
                <span className="font-semibold text-ink tabular-nums">{line.quantity}×</span>{" "}
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
      </section>

      {/* Timeline */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-4 flex items-center gap-2 text-h3 text-ink">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          {t("panelTimeline")}
        </h2>
        <OrderTimeline order={order} now={now} />
      </section>

      {/* -- the dialogs the guarded transitions need ---------------------- */}

      {dialog?.kind === "prep-time" && (
        <PrepTimeDialog
          open
          orderNumber={order.orderNumber}
          itemCount={cartCount(order.lines)}
          submitting={submitting}
          onClose={() => setDialog(null)}
          onConfirm={(minutes) => run("confirmed", { prepMinutes: minutes })}
        />
      )}

      {dialog?.kind === "reject-reason" && (
        <ReasonDialog
          open
          title={t("rejectTitle")}
          body={t("rejectBody", { number: order.orderNumber })}
          reasons={REJECT_REASONS}
          confirmLabel={t("confirmReject")}
          submitting={submitting}
          onClose={() => setDialog(null)}
          onConfirm={(reason: OrderCancelReason, note) =>
            run("rejected", { reason, note: note || null })
          }
        />
      )}

      {dialog?.kind === "cancel-reason" && (
        <ReasonDialog
          open
          title={t("cancelTitle")}
          body={t("cancelBody", { number: order.orderNumber })}
          reasons={REJECT_REASONS}
          confirmLabel={t("confirmCancel")}
          submitting={submitting}
          onClose={() => setDialog(null)}
          onConfirm={(reason: OrderCancelReason, note) =>
            run("cancelled", { reason, note: note || null })
          }
        />
      )}

      {dialog?.kind === "fail-reason" && (
        <ReasonDialog
          open
          title={t("failTitle")}
          body={t("failBody", { number: order.orderNumber })}
          reasons={DELIVERY_FAIL_REASONS}
          confirmLabel={t("confirmFail")}
          submitting={submitting}
          onClose={() => setDialog(null)}
          onConfirm={(reason: OrderCancelReason, note) =>
            run("delivery-failed", { reason, note: note || null })
          }
        />
      )}

      {dialog?.kind === "rider" && (
        <AssignRiderDialog
          open
          order={order}
          fleet={fleet}
          busy={busy}
          offShift={offShift}
          notApproved={notApproved}
          submitting={submitting}
          title={dialog.reassign ? t("reassignTitle") : undefined}
          body={
            dialog.reassign
              ? t("reassignBody", {
                  number: order.orderNumber,
                  name: rider?.name ?? "",
                })
              : undefined
          }
          onClose={() => setDialog(null)}
          onAuto={() => {
            setSubmitting(true);
            const result = autoDispatch(orderId);
            setSubmitting(false);
            if (result.error) {
              toast.error(t(result.error));
              return;
            }
            toast.success(
              t("riderAssigned", { name: result.order?.lifecycle.rider?.name ?? "" }),
            );
            setDialog(null);
          }}
          onAssign={(picked) => {
            setSubmitting(true);
            const result = dialog.reassign
              ? reassignRider(orderId, picked)
              : assignRider(orderId, picked, "manual");
            setSubmitting(false);
            if (result.error) {
              toast.error(t(result.error));
              return;
            }
            toast.success(
              t(dialog.reassign ? "riderReassigned" : "riderAssigned", { name: picked.name }),
            );
            setDialog(null);
          }}
        />
      )}

      {/* A cash delivery cannot reach `delivered` without this answer — the
          machine refuses it (G05), so the operator is asked the same question
          the rider is asked at the door. */}
      {dialog?.kind === "cash" && (
        <ConfirmDialog
          open
          title={t("cashTitle")}
          body={t("cashBody", {
            amount: formatPrice(cashDue, currency),
            name: rider?.name ?? order.contact.name,
          })}
          confirmLabel={t("cashConfirm")}
          submitting={submitting}
          onClose={() => setDialog(null)}
          onConfirm={() => run(dialog.to, { cashCollected: true })}
        />
      )}

      {/* Collecting the food needs a verified handover, and the desk is not exempt
          (G22) — an operator who could wave food out of a kitchen would make the
          checklist advisory. The code is revealed here because the desk *is* the
          platform; it is not revealed on the restaurant's own board. */}
      {dialog?.kind === "handover" && (
        <HandoverDialog
          open
          order={order}
          revealCode
          submitting={submitting}
          error={handoverError}
          onClose={() => setDialog(null)}
          onConfirm={(handover) => {
            const result = advance(orderId, "picked-up", "admin", { handover });
            if (result.error) {
              // A wrong code is counted on the order, exactly as a wrong doorstep
              // code is — the store does the counting because a refused
              // transition is pure and leaves the order untouched.
              if (result.error === "errors.handoverCodeInvalid") failHandover(orderId);
              setHandoverError(t(result.error));
              return;
            }
            setHandoverError(null);
            setDialog(null);
            toast.success(t("interveneDone", { status: to("status.picked-up") }));
          }}
        />
      )}

      {dialog?.kind === "confirm" && (
        <ConfirmDialog
          open
          title={t("moveConfirmTitle", { status: to(`status.${dialog.to}`) })}
          body={t("moveConfirmBody", { number: order.orderNumber })}
          confirmLabel={t("moveConfirm")}
          tone={dialog.to === "returned" ? "danger" : "primary"}
          submitting={submitting}
          onClose={() => setDialog(null)}
          onConfirm={() => run(dialog.to)}
        />
      )}
    </div>
  );
}

/** One inspection panel. */
function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
        <Icon className="size-4 text-muted" aria-hidden />
        {title}
      </h2>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </section>
  );
}

/** One labelled fact. */
function Row({
  label,
  value,
  mono = false,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  tone?: "danger" | "fresh" | "primary";
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-end text-sm font-semibold",
          mono && "font-mono",
          tone === "danger"
            ? "text-danger"
            : tone === "fresh"
              ? "text-fresh-600"
              : tone === "primary"
                ? "text-primary"
                : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
