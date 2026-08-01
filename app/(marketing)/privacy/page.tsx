import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getLegalDoc } from "@/services/pages";
import { LegalDocument } from "@/components/marketing/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const [doc, t] = await Promise.all([getLegalDoc("privacy"), getTranslations("legal")]);
  return {
    title: doc?.title ?? t("privacy"),
    description: t("privacyDescription"),
    alternates: { canonical: "/privacy" },
  };
}

/** Privacy policy (spec: CMS — Privacy). Content comes from the pages seam. */
export default async function PrivacyPage() {
  const doc = await getLegalDoc("privacy");
  if (!doc) notFound();
  return <LegalDocument doc={doc} />;
}
