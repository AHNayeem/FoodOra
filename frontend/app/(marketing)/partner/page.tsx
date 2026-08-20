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
 *
 * The page itself is unchanged by Phase 6 — it persuades, and it did that already.
 * What changed is where it sends somebody who is persuaded: `/partner/apply`.
 */
export default async function PartnerPage() {
  const [t, locale] = await Promise.all([getTranslations("partner"), getLocale()]);
  const root = await getTranslations();
  const content = await getPartnerContent({ locale, translate: (key) => root(key) });

  return (
    <PitchPage
      content={content}
      docKey="partner"
      // Phase 6: the CTA used to be `/register`, which created an account and
      // dropped the owner on a dashboard belonging to the flagship demo vendor.
      // It now leads to the application (G08).
      signUpHref="/partner/apply"
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
