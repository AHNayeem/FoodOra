import type { Metadata } from "next";
import { AdminCampaigns } from "@/components/admin/campaigns-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Campaigns",
  robots: { index: false, follow: false },
};

/**
 * Platform coupons and campaigns (spec: Admin Panel → Coupons, Phase 12) — the
 * codes the platform funds, as opposed to the ones a restaurant hands out from
 * its own dashboard.
 */
export default function AdminCampaignsPage() {
  return <AdminCampaigns />;
}
