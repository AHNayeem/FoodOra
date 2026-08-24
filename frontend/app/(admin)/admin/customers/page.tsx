import type { Metadata } from "next";
import { AdminCustomers } from "@/components/admin/customers-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Customers",
  robots: { index: false, follow: false },
};

/**
 * Customer management (spec: Admin Panel → Customers, Phase 11) — the directory
 * behind every "this is the fourth time" support call.
 */
export default function AdminCustomersPage() {
  return <AdminCustomers />;
}
