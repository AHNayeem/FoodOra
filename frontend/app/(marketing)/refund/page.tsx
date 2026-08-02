import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getLegalDoc } from "@/services/pages";
import { getRouteMetadata, readOptions } from "@/services/cms";
import { LegalDocument } from "@/components/marketing/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const options = readOptions(locale, (key) => t(key));
  const doc = await getLegalDoc("refund", { locale, translate: (key) => t(key) });

  return getRouteMetadata("/refund", options, {
    title: doc?.title ?? t("legal.refund"),
    description: t("legal.refundDescription"),
  });
}

/** Refund policy (spec: CMS — Refund). Content comes from the CMS seam. */
export default async function RefundPage() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const doc = await getLegalDoc("refund", { locale, translate: (key) => t(key) });
  if (!doc) notFound();
  return <LegalDocument doc={doc} />;
}
