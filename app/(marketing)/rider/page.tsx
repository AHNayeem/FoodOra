import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getRiderContent } from "@/services/pages";
import { PitchPage } from "@/components/marketing/pitch-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rider");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/rider" },
  };
}

/**
 * Become a rider — the courier acquisition page linked from the footer's "For
 * business" column. Shares {@link PitchPage} with `/partner`; the rider app
 * itself is Phase C18.
 */
export default async function RiderPage() {
  const [content, t] = await Promise.all([getRiderContent(), getTranslations("rider")]);

  return (
    <PitchPage
      content={content}
      signUpHref="/register"
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
