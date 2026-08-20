import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RiderApplicationForm } from "@/components/marketing/rider-application-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return {
    title: t("riderMetaTitle"),
    description: t("riderMetaDescription"),
    robots: { index: false, follow: true },
  };
}

/**
 * Rider onboarding (spec: Phase 7 — "Upgrade /rider", G10).
 *
 * The counterpart to `/partner/apply`, and the same shape for the same reason: the
 * pitch page persuades, this collects. Before Phase 7 there was no way to become a
 * rider at all — `RegisterInput.role` did not include `delivery-rider`.
 */
export default function RiderApplyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <RiderApplicationForm />
    </div>
  );
}
