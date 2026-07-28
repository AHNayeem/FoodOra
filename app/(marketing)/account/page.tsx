import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProfileView } from "@/components/account/profile-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("nav.profile"), robots: { index: false } };
}

/** Account profile (Phase C3). Private, so it's not indexed. */
export default function AccountProfilePage() {
  return <ProfileView />;
}
