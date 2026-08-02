import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getLegalDoc } from "@/frontend/services/pages";
import { getRouteMetadata, readOptions } from "@/frontend/services/cms";
import { LegalDocument } from "@/frontend/components/marketing/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const options = readOptions(locale, (key) => t(key));
  const doc = await getLegalDoc("privacy", { locale, translate: (key) => t(key) });

  return getRouteMetadata("/privacy", options, {
    title: doc?.title ?? t("legal.privacy"),
    description: t("legal.privacyDescription"),
  });
}

/** Privacy policy (spec: CMS — Privacy). Content comes from the pages seam. */
export default async function PrivacyPage() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const doc = await getLegalDoc("privacy", { locale, translate: (key) => t(key) });
  if (!doc) notFound();
  return <LegalDocument doc={doc} />;
}
