import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getRiderContent } from "@/services/pages";
import { getRouteMetadata, readOptions } from "@/services/cms";
import { PitchPage } from "@/components/marketing/pitch-page";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return getRouteMetadata("/rider", readOptions(locale, (key) => t(key)), {
    title: t("rider.metaTitle"),
    description: t("rider.metaDescription"),
  });
}

/**
 * Become a rider — the courier acquisition page linked from the footer's "For
 * business" column. Shares {@link PitchPage} with `/partner`; the rider app
 * itself is Phase C18 and the application is Phase 7 (`/rider/apply`).
 */
export default async function RiderPage() {
  const [t, locale] = await Promise.all([getTranslations("rider"), getLocale()]);
  const root = await getTranslations();
  const content = await getRiderContent({ locale, translate: (key) => root(key) });

  return (
    <PitchPage
      content={content}
      docKey="rider"
      // Phase 7: `/register` could not create a rider at all — the role was not in
      // `RegisterInput`. The CTA now leads to the application (G10).
      signUpHref="/rider/apply"
      secondaryHref="/help"
      appLink={{ href: "/delivery", label: t("openApp") }}
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
