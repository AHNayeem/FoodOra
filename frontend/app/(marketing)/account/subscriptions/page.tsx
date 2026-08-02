import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SubscriptionsView } from "@/frontend/components/subscriptions/subscriptions-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("nav.subscriptions"), robots: { index: false } };
}

/**
 * Meal-plan subscriptions (Phase C15). Reads the persisted subscriptions store
 * and manages them in place — skip a day, pause, resume, cancel. Suspense wraps
 * the view because it reads `?new=` from the URL to highlight a fresh sign-up.
 */
export default function AccountSubscriptionsPage() {
  return (
    <Suspense fallback={null}>
      <SubscriptionsView />
    </Suspense>
  );
}
