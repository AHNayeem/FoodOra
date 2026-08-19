import type { Metadata } from "next";
import { AdminOrderDetail } from "@/components/admin/order-detail-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Order detail",
  robots: { index: false, follow: false },
};

/**
 * One order, in full, with the intervention controls (Phase 4). A route rather
 * than a panel so the notification fan-out and a support call can both link
 * straight to it.
 */
export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminOrderDetail orderId={id} />;
}
