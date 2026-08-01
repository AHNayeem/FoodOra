import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPartnerContent } from "@/services/pages";
import { PitchPage } from "@/components/marketing/pitch-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("partner");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/partner" },
  };
}

/**
 * Partner with us — the vendor acquisition page linked from the footer's "For
 * business" column. Shares {@link PitchPage} with `/rider`; the content comes
 * from the pages seam and the chrome from the `partner` namespace.
 */
export default async function PartnerPage() {
  const [content, t] = await Promise.all([getPartnerContent(), getTranslations("partner")]);

  return (
    <PitchPage
      content={content}
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
