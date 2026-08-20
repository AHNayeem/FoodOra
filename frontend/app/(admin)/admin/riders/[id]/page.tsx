import type { Metadata } from "next";
import { AdminRiderDetail } from "@/components/admin/rider-detail-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Rider application",
  robots: { index: false, follow: false },
};

/**
 * One courier: their paperwork, the five decisions, and what they have actually
 * delivered and earned (Phase 7).
 */
export default async function AdminRiderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminRiderDetail applicationId={id} />;
}
