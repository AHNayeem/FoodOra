import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getLegalDoc } from "@/frontend/services/pages";
import { getRouteMetadata, readOptions } from "@/frontend/services/cms";
import { LegalDocument } from "@/frontend/components/marketing/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const options = readOptions(locale, (key) => t(key));
  const doc = await getLegalDoc("terms", { locale, translate: (key) => t(key) });

  return getRouteMetadata("/terms", options, {
    title: doc?.title ?? t("legal.terms"),
    description: t("legal.termsDescription"),
  });
}

/** Terms of service (spec: CMS — Terms). Content comes from the pages seam. */
export default async function TermsPage() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const doc = await getLegalDoc("terms", { locale, translate: (key) => t(key) });
  if (!doc) notFound();
  return <LegalDocument doc={doc} />;
}
