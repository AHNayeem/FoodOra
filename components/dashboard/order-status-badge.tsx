import { useTranslations } from "next-intl";
import type { OrderStatus } from "@/types";
import { cn } from "@/lib/utils";

/** Tone per lifecycle stage — reused by the board and the recent-orders list. */
const TONE: Record<OrderStatus, string> = {
  placed: "bg-accent-50 text-accent-600",
  confirmed: "bg-primary/10 text-primary",
  preparing: "bg-accent-50 text-accent-600",
  ready: "bg-fresh-50 text-fresh-600",
  "picked-up": "bg-primary/10 text-primary",
  "on-the-way": "bg-primary/10 text-primary",
  delivered: "bg-fresh-50 text-fresh-600",
  cancelled: "bg-danger/10 text-danger",
};

/**
 * OrderStatusBadge — a small pill showing an order's lifecycle stage, reusing
 * the shared `order.status.*` labels so wording stays consistent with the
 * customer-facing tracker.
 */
export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const t = useTranslations("order");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold",
        TONE[status],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
