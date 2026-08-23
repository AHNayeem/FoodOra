import type { Metadata } from "next";
import { AdminPayoutDetail } from "@/components/admin/payout-detail-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Settlement",
  robots: { index: false, follow: false },
};

/**
 * One settlement, with the orders behind it and the transfer itself (Phase 8).
 * A route so a payout can be linked to; the id says which ledger it is on.
 */
export default async function AdminPayoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminPayoutDetail settlementId={id} />;
}
