import type { Metadata } from "next";
import { AdminRestaurantDetail } from "@/components/admin/restaurant-detail-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Restaurant application",
  robots: { index: false, follow: false },
};

/**
 * One restaurant application, with its paperwork and the four decisions
 * (Phase 6). A route so a notification can link straight to the application.
 */
export default async function AdminRestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminRestaurantDetail applicationId={id} />;
}
