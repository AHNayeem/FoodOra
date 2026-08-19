import type { Metadata } from "next";
import { SupportTicketView } from "@/components/account/support-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Support ticket",
  robots: { index: false, follow: false },
};

/** One of the customer's support conversations (Phase 5). */
export default async function AccountSupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupportTicketView ticketId={id} />;
}
