import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

/**
 * Dashboard layout (Phase C10). Lives in its own `(dashboard)` route group, so
 * it does NOT inherit the marketing site chrome — the shell provides its own
 * sidebar + topbar. The whole section is private; the shell enforces the
 * client-side auth + role gate and resolves the managed vendor.
 */
export const metadata: Metadata = {
  title: "Restaurant Dashboard",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
