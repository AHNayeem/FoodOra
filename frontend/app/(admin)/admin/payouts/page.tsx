import type { Metadata } from "next";
import { AdminPayouts } from "@/components/admin/payouts-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Payouts",
  robots: { index: false, follow: false },
};

/**
 * The payout run (spec: Admin Panel → Commission, payouts & settlement,
 * Phase 8) — vendor settlements and rider remittance over one order book.
 */
export default function AdminPayoutsPage() {
  return <AdminPayouts />;
}
