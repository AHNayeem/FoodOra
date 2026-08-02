import type { Metadata } from "next";
import { AdminShell } from "@/frontend/components/admin/admin-shell";

/** Private surface — never indexed, never prerendered with data. */
export const metadata: Metadata = {
  title: "Platform operations",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
