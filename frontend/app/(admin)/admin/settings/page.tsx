import type { Metadata } from "next";
import { PlatformSettingsView } from "@/components/admin/platform-settings/settings-view";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Platform settings",
  robots: { index: false, follow: false },
};

/**
 * Platform configuration (spec: Admin Panel → Settings, Phase 19, G30) — the
 * countries the platform trades in and on what tax terms, and the delivery
 * network: what each zone covers, what it pays a courier, and whether it is open
 * at all.
 */
export default function AdminPlatformSettingsPage() {
  return <PlatformSettingsView />;
}
