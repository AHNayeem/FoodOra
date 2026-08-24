import { AnalyticsView } from "@/components/dashboard/analytics-view";

/**
 * Restaurant analytics (spec: Restaurant Dashboard → Analytics, Phase 10, G23) —
 * a date-ranged report over the shared order book: revenue, orders, average order
 * value, peak hours, top products, completed and cancelled counts, commission and
 * net revenue, with a CSV export (client).
 */
export default function DashboardAnalyticsPage() {
  return <AnalyticsView />;
}
