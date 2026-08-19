"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ShoppingBag, Star } from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { Order } from "@/types";
import { useOrders } from "@/stores/orders";
import { useReviews } from "@/stores/reviews";
import { liveTicketForOrder, useSupport } from "@/stores/support";
import { cartCount } from "@/lib/cart";
import { isActive, splitOrders } from "@/lib/order-lifecycle";
import { isTerminal } from "@/lib/order-machine";
import { canReviewOrder } from "@/lib/reviews";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { CompleteOrderButton } from "@/components/orders/complete-order-button";
import { WriteReviewDialog } from "@/components/reviews/write-review-dialog";
import { ReportProblemButton } from "@/components/support/report-problem-dialog";

/**
 * OrderHistory — the customer's active & past orders (Phase C3).
 *
 * The split used to be computed by projecting a status from the clock, which
 * meant an order the restaurant had never touched still drifted from "active"
 * into "past" after forty minutes. It now reads the order's real status
 * (`isActive`), so this list agrees with the tracker it links into — and with
 * whatever the kitchen last did.
 */
export function OrderHistory() {
  const t = useTranslations("account");
  const orders = useOrders((s) => s.orders);
  const hydrated = useOrders((s) => s.hydrated);
  // One reading of the clock for the whole list, taken at mount: every card's
  // "can this still be reviewed?" has to be answered against the same instant.
  const [nowMs] = useState(() => Date.now());
  useEffect(() => {
    useOrders.persist.rehydrate();
    useReviews.persist.rehydrate();
    // Reporting a problem is offered from here too, and it needs to know whether
    // there is already a conversation about the order (Phase 5).
    useSupport.persist.rehydrate();
  }, []);

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-panel border border-line bg-surface p-8 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <ShoppingBag className="size-7" aria-hidden />
        </span>
        <h2 className="text-h3 text-ink">{t("ordersEmpty")}</h2>
        <p className="max-w-sm text-body">{t("ordersEmptyHint")}</p>
        <Button href="/restaurants" className="mt-2">
          {t("browseRestaurants")}
        </Button>
      </div>
    );
  }

  const { active, past } = splitOrders(orders);

  return (
    <div className="space-y-8">
      {active.length > 0 && (
        <Group title={t("activeOrders")}>
          {active.map((order) => (
            <OrderCard key={order.id} order={order} nowMs={nowMs} live />
          ))}
        </Group>
      )}
      {past.length > 0 && (
        <Group title={t("pastOrders")}>
          {past.map((order) => (
            <OrderCard key={order.id} order={order} nowMs={nowMs} />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      <ul className="space-y-4">{children}</ul>
    </section>
  );
}

function OrderCard({
  order,
  nowMs,
  live = false,
}: {
  order: Order;
  nowMs: number;
  live?: boolean;
}) {
  const t = useTranslations("account");
  const locale = useLocale();
  const reviews = useReviews((s) => s.reviews);
  const tickets = useSupport((s) => s.tickets);
  const [rating, setRating] = useState(false);
  const reviewable = canReviewOrder(
    order,
    nowMs,
    reviews.some((review) => review.orderId === order.id && !review.deletedAt),
  );
  const currency = order.vendor.currency as CurrencyCode;
  const count = cartCount(order.lines);
  const placed = new Date(order.placedAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <li className="rounded-panel border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/restaurants/${order.vendor.slug}`}
              className="truncate font-semibold text-ink hover:text-primary"
            >
              {order.vendor.name}
            </Link>
            <OrderStatusChip status={order.status} live={live} size="sm" />
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {t("orderRef", { number: order.orderNumber })} · {placed}
          </p>
        </div>
        <p className="text-right">
          <span className="block font-bold text-ink">
            {formatPrice(order.pricing.total, currency)}
          </span>
          <span className="text-xs text-muted">{t("orderItems", { count })}</span>
        </p>
      </div>

      {/* Line preview */}
      <p className="mt-3 truncate text-sm text-body">
        {order.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}
      </p>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {isActive(order) && (
          <Button href={`/orders/${order.id}`} size="sm">
            {t("track")}
          </Button>
        )}
        {/* Delivered but not closed — the last step of the lifecycle, offered
            here as well as on the tracker so a customer who has navigated away
            can still finish it (G03). */}
        <CompleteOrderButton order={order} actor="customer" size="sm" />
        <Button href={`/checkout/success?order=${order.id}`} size="sm" variant="outline">
          {isTerminal(order.status) ? t("viewInvoice") : t("viewReceipt")}
        </Button>
        <Button href={`/restaurants/${order.vendor.slug}`} size="sm" variant="ghost">
          {t("reorder")}
        </Button>
        {/* Rating is only offered where it is actually allowed — the same window
            check the seam re-runs on submit (Phase C22). */}
        {reviewable && (
          <Button size="sm" variant="outline" onClick={() => setRating(true)}>
            <Star className="size-4" aria-hidden />
            {t("rateOrder")}
          </Button>
        )}
        {/* Something went wrong with a finished order (Phase 5, G25). */}
        {!isActive(order) && (
          <ReportProblemButton
            order={order}
            liveTicketId={liveTicketForOrder(tickets, order.id)?.id ?? null}
          />
        )}
      </div>

      {reviewable && (
        <WriteReviewDialog order={order} open={rating} onClose={() => setRating(false)} />
      )}
    </li>
  );
}
