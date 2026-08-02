import { LiveOps } from "@/frontend/components/admin/live-ops";

/**
 * Platform operations — live orders, restaurant load, fleet status and today's
 * revenue, all derived from the shared order store (spec: Admin Dashboard).
 */
export default function AdminPage() {
  return <LiveOps />;
}
