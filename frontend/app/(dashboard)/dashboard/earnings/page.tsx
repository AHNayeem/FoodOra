import { EarningsView } from "@/components/dashboard/earnings-view";

/**
 * Restaurant earnings (spec: Restaurant Dashboard → Earnings, Phase 8) —
 * balances, commission statements, settlement history and payout history, all
 * derived from the commission records completed orders carry.
 */
export default function DashboardEarningsPage() {
  return <EarningsView />;
}
