import type { Metadata } from "next";
import { AdminNotificationCenter } from "@/components/admin/notification-center";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Notification centre",
  robots: { index: false, follow: false },
};

/**
 * Notification Center (spec: Admin Panel → Notification Center, Phase C25) —
 * compose a broadcast to a segment, review what has been sent, and read the
 * delivery log.
 */
export default function AdminNotificationsPage() {
  return <AdminNotificationCenter />;
}
