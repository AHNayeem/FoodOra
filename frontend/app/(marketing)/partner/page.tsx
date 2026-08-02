import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getPartnerContent } from "@/services/pages";
import { getRouteMetadata, readOptions } from "@/services/cms";
import { PitchPage } from "@/components/marketing/pitch-page";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return getRouteMetadata("/partner", readOptions(locale, (key) => t(key)), {
    title: t("partner.metaTitle"),
    description: t("partner.metaDescription"),
  });
}

/**
 * Partner with us — the vendor acquisition page linked from the footer's "For
 * business" column. Shares {@link PitchPage} with `/rider`; the content comes
 * from the pages seam and the chrome from the `partner` namespace.
 */
export default async function PartnerPage() {
  const [t, locale] = await Promise.all([getTranslations("partner"), getLocale()]);
  const root = await getTranslations();
  const content = await getPartnerContent({ locale, translate: (key) => root(key) });

  return (
    <PitchPage
      content={content}
      docKey="partner"
      signUpHref="/register"
      secondaryHref="/help"
      copy={{
        eyebrow: t("eyebrow"),
        title: t("title"),
        primaryCta: t("primaryCta"),
        secondaryCta: t("secondaryCta"),
        benefitsTitle: t("benefitsTitle"),
        benefitsSubtitle: t("benefitsSubtitle"),
        stepsTitle: t("stepsTitle"),
        stepsSubtitle: t("stepsSubtitle"),
        faqTitle: t("faqTitle"),
        faqSubtitle: t("faqSubtitle"),
        ctaTitle: t("ctaTitle"),
        ctaBody: t("ctaBody"),
        ctaAction: t("ctaAction"),
      }}
    />
  );
}
