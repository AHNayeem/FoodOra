import type { Metadata } from "next";
import { AdminReviewQueue } from "@/components/admin/review-queue-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Review moderation",
  robots: { index: false, follow: false },
};

/**
 * Review moderation (spec: Admin Panel → Reviews, Phase 13) — the queue behind
 * every "this review is abusive" mail a restaurant sends.
 */
export default function AdminReviewsPage() {
  return <AdminReviewQueue />;
}
