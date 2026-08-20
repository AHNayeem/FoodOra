import type { Metadata } from "next";
import { AdminRestaurants } from "@/components/admin/restaurants-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Restaurants",
  robots: { index: false, follow: false },
};

/**
 * Restaurant management (spec: Admin Panel → Restaurants, Phase 6) — every
 * restaurant on the platform and every application to join it, over one store.
 */
export default function AdminRestaurantsPage() {
  return <AdminRestaurants />;
}
