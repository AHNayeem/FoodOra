import type { OrderStatus } from "@/types";
import { OrderStatusChip } from "@/components/orders/order-status-chip";

/**
 * OrderStatusBadge — the dashboard's status pill.
 *
 * Kept as the name the dashboard already imports, but the tone/icon table it
 * used to own now lives in `components/orders/order-status-meta`, alongside the
 * one the customer's tracker and the rider app read from. Three surfaces had
 * drifted into three colour schemes for the same eight states; there are fifteen
 * states now, and one table.
 */
export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return <OrderStatusChip status={status} className={className} />;
}
