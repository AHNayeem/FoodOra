import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getMealPlanBySlug,
  getPlanTiers,
  getPlanVendor,
} from "@/frontend/services/subscriptions";
import { SubscribeBuilder } from "@/frontend/components/subscriptions/subscribe-builder";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ slug }, t] = await Promise.all([params, getTranslations("subscriptions")]);
  const plan = await getMealPlanBySlug(slug);
  return {
    title: plan ? t("buildSubtitle", { name: plan.name }) : t("buildTitle"),
    robots: { index: false },
  };
}

/**
 * Subscribe flow (Phase C15). Resolves the plan, its tiers and its kitchen
 * server-side, then hands them to the client builder. A tier can be
 * pre-selected from the detail page via `?tier=<id>`. Not indexed — it is a
 * transaction surface, not a landing page.
 */
export default async function SubscribePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const plan = await getMealPlanBySlug(slug);
  if (!plan) notFound();

  const [tiers, vendor] = await Promise.all([getPlanTiers(plan.id), getPlanVendor(plan)]);
  if (!vendor) notFound();

  const initialTierId = typeof raw.tier === "string" ? raw.tier : null;

  return (
    <SubscribeBuilder
      plan={plan}
      tiers={tiers}
      vendor={vendor}
      initialTierId={initialTierId}
    />
  );
}
