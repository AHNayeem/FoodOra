import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VendorDirectory } from "@/frontend/components/directory/vendor-directory";
import type { SortKey } from "@/frontend/components/filters/vendor-filters";

const SORTS = new Set<SortKey>(["recommended", "rating", "delivery-time", "distance"]);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("homeChefs");
  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: { canonical: "/home-chefs" },
  };
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Home Chef Marketplace (spec: Home Chef Marketplace). Same directory mechanics
 * as the other verticals, with copy that leads on verification and cook-to-order
 * lead times — the two things buyers actually ask about here.
 */
export default async function HomeChefsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const t = await getTranslations("homeChefs");

  const sortParam = typeof raw.sort === "string" ? raw.sort : "";
  const sort = SORTS.has(sortParam as SortKey) ? (sortParam as SortKey) : "recommended";

  return (
    <VendorDirectory
      type="home-chef"
      title={t("title")}
      subtitle={t("subtitle")}
      features={[
        { icon: "BadgeCheck", title: t("feature1Title"), description: t("feature1Body") },
        { icon: "ChefHat", title: t("feature2Title"), description: t("feature2Body") },
        { icon: "CalendarClock", title: t("feature3Title"), description: t("feature3Body") },
      ]}
      sort={sort}
      openNow={raw.open === "1"}
      search={typeof raw.q === "string" ? raw.q : ""}
    />
  );
}
