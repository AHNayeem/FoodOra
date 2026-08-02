import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsView } from "@/components/account/settings-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title"), robots: { index: false } };
}

/** Account settings (Phase C28). Private, so not indexed. */
export default function AccountSettingsPage() {
  return <SettingsView />;
}
