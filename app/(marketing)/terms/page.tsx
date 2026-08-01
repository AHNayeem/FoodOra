import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getLegalDoc } from "@/services/pages";
import { LegalDocument } from "@/components/marketing/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const [doc, t] = await Promise.all([getLegalDoc("terms"), getTranslations("legal")]);
  return {
    title: doc?.title ?? t("terms"),
    description: t("termsDescription"),
    alternates: { canonical: "/terms" },
  };
}

/** Terms of service (spec: CMS — Terms). Content comes from the pages seam. */
export default async function TermsPage() {
  const doc = await getLegalDoc("terms");
  if (!doc) notFound();
  return <LegalDocument doc={doc} />;
}
