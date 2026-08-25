import type { Metadata } from "next";
import { AdminAnalytics } from "@/components/admin/analytics-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Platform analytics",
  robots: { index: false, follow: false },
};

/**
 * Platform analytics (spec: Admin Panel → Analytics / Reports, Phase 16, G33) —
 * a date-ranged report over the shared order book: GMV, orders, completed,
 * cancelled, refunded, commission, restaurant and courier league tables, customer
 * activity, top products and delivery performance, with a CSV export.
 *
 * Gated on `analytics.view` by `components/admin/admin-shell`, which owns the
 * route table (`lib/rbac.ADMIN_ROUTE_PERMISSIONS`) — a second check here would be
 * a second place for the answer to drift.
 */
export default function AdminAnalyticsPage() {
  return <AdminAnalytics />;
}
