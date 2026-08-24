import type { Metadata } from "next";
import { AdminCustomerDetail } from "@/components/admin/customer-detail-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Customer",
  robots: { index: false, follow: false },
};

/**
 * One customer, with their orders, their disputes and the moderation controls
 * beside them (Phase 11). A route so a ticket or an order can link straight to
 * the person.
 */
export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminCustomerDetail customerId={id} />;
}
