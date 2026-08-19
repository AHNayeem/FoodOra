import type { Metadata } from "next";
import { AdminSupportDetail } from "@/components/admin/support-detail-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Support ticket",
  robots: { index: false, follow: false },
};

/**
 * One dispute, with the order and payment context beside it and the decision
 * controls (Phase 5). A route so a notification can link straight to the ticket.
 */
export default async function AdminSupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminSupportDetail ticketId={id} />;
}
