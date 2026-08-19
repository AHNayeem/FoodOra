import type { Metadata } from "next";
import { AdminOrders } from "@/components/admin/orders-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};

/**
 * Order operations (spec: Admin Panel → Orders, Phase 4) — every order on the
 * platform, searchable and filterable, over the same store the live board reads.
 */
export default function AdminOrdersPage() {
  return <AdminOrders />;
}
