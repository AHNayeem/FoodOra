import type { Metadata } from "next";
import { AdminSupportQueue } from "@/components/admin/support-queue";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Support queue",
  robots: { index: false, follow: false },
};

/**
 * Support and disputes (spec: Admin Panel → Support, Phase 5) — the queue the
 * `customer-support` role exists to work.
 */
export default function AdminSupportPage() {
  return <AdminSupportQueue />;
}
