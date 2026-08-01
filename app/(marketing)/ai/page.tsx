import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AssistantHub } from "@/components/ai/assistant-hub";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ai");
  return {
    title: t("meta.title"),
    description: t("meta.description"),
  };
}

/**
 * The food assistant, full page (Phase C24).
 *
 * A thin server shell around a client hub: the conversation, the profile and
 * the plan are all *this device's*, so there is nothing here for the server to
 * render — but the route still carries real metadata, because "ask us what to
 * eat" is a page worth landing on, unlike the query-driven pages this app keeps
 * out of the index.
 */
export default function AiPage() {
  return <AssistantHub />;
}
