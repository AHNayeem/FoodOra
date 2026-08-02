import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotificationCenter } from "@/frontend/components/notifications/notification-center";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("nav.notifications"), robots: { index: false } };
}

/**
 * Notification centre (Phase C25) — the customer's whole inbox plus the
 * delivery log beneath it. Client-rendered from the persisted store; private,
 * so never indexed.
 */
export default function AccountNotificationsPage() {
  return <NotificationCenter />;
}
