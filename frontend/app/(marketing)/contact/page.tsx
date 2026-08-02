import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getContactContent, getRouteMetadata, readOptions } from "@/services/cms";
import { ContactPage } from "@/components/marketing/contact-page";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return getRouteMetadata("/contact", readOptions(locale, (key) => t(key)), {
    title: t("contact.metaTitle"),
    description: t("contact.metaDescription"),
  });
}

/**
 * Contact (spec: CMS — Contact). The page is a single CMS document — channels,
 * offices, the form's heading and its note — and holds no copy of its own.
 */
export default async function ContactRoute() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const content = await getContactContent(undefined, readOptions(locale, (key) => t(key)));
  if (!content) notFound();

  return <ContactPage content={content} />;
}
