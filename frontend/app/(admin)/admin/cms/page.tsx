import type { Metadata } from "next";
import { CmsOverview } from "@/frontend/components/admin/cms/cms-overview";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Content",
  robots: { index: false, follow: false },
};

/**
 * CMS (spec: Admin Panel → CMS / Content Management, Phase C26) — the
 * collections, what is waiting to be published, the audit trail, and the
 * messages the contact form took.
 */
export default function AdminCmsPage() {
  return <CmsOverview />;
}
