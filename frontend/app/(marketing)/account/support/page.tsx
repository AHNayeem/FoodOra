import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SupportView } from "@/components/account/support-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return {
    title: t("customerTitle"),
    description: t("customerSubtitle"),
    robots: { index: false, follow: false },
  };
}

/**
 * The customer's support tickets (spec: Report a Problem, Phase 5) — status, the
 * order each is about, the conversation and the resolution.
 */
export default function AccountSupportPage() {
  return <SupportView />;
}
