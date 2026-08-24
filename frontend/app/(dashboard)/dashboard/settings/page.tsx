import { SettingsView } from "@/components/dashboard/settings/settings-view";

/**
 * Restaurant settings (spec: Restaurant Dashboard → Settings, Phase 10, G18/G24) —
 * profile, logo/cover, address, phone, opening hours, delivery settings, branches
 * and staff, folded over the read-only catalog listing (client).
 */
export default function DashboardSettingsPage() {
  return <SettingsView />;
}
