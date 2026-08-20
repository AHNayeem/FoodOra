import type { Metadata } from "next";
import { AdminRiders } from "@/components/admin/riders-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Riders",
  robots: { index: false, follow: false },
};

/**
 * Fleet management (spec: Admin Panel → Riders, Phase 7) — the fleet, its
 * availability and every application to join it, over one store.
 */
export default function AdminRidersPage() {
  return <AdminRiders />;
}
