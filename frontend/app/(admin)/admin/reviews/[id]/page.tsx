import type { Metadata } from "next";
import { AdminReviewModerationDetail } from "@/components/admin/review-moderation-detail";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Reported review",
  robots: { index: false, follow: false },
};

/**
 * One reported review, with the restaurant, the order and the author beside it
 * (Phase 13). A route so a report notification or a support ticket can link
 * straight to the decision.
 */
export default async function AdminReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminReviewModerationDetail reviewId={id} />;
}
