import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PartnerApplicationForm } from "@/components/marketing/partner-application-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return {
    title: t("partnerMetaTitle"),
    description: t("partnerMetaDescription"),
    // An application form is not a landing page: nothing to index, and a
    // half-filled draft is nobody's business but the applicant's.
    robots: { index: false, follow: true },
  };
}

/**
 * Restaurant onboarding (spec: Phase 6 — "Upgrade /partner", G08).
 *
 * A sub-route rather than a replacement for `/partner`: the pitch page is what
 * persuades somebody to apply and still does its job, and its two calls to action
 * now lead here instead of to `/register`, which used to drop an applicant into a
 * dashboard belonging to the flagship demo restaurant.
 */
export default function PartnerApplyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <PartnerApplicationForm />
    </div>
  );
}
