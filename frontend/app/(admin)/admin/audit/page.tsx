import type { Metadata } from "next";
import { AdminAuditLog } from "@/components/admin/audit-log-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Audit log",
  robots: { index: false, follow: false },
};

/**
 * Platform audit log (spec: Admin Panel → Audit Logs, Phase 15) — every important
 * mutation on the platform and the account that made it.
 *
 * Gated on `audit.view` by `components/admin/admin-shell`, which is why there is
 * no check here: the shell owns the route table (`lib/rbac.ADMIN_ROUTE_PERMISSIONS`)
 * and a second check in the page would be a second place for the answer to drift.
 */
export default function AdminAuditPage() {
  return <AdminAuditLog />;
}
