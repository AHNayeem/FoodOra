import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VendorDirectory } from "@/frontend/components/directory/vendor-directory";
import type { SortKey } from "@/frontend/components/filters/vendor-filters";

const SORTS = new Set<SortKey>(["recommended", "rating", "delivery-time", "distance"]);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cloudKitchens");
  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: { canonical: "/cloud-kitchens" },
  };
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Cloud Kitchen Directory (spec: Cloud Kitchen Directory). Delivery-only
 * kitchens, so the copy leads on speed and packaging rather than atmosphere.
 */
export default async function CloudKitchensPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const t = await getTranslations("cloudKitchens");

  const sortParam = typeof raw.sort === "string" ? raw.sort : "";
  const sort = SORTS.has(sortParam as SortKey) ? (sortParam as SortKey) : "recommended";

  return (
    <VendorDirectory
      type="cloud-kitchen"
      title={t("title")}
      subtitle={t("subtitle")}
      features={[
        { icon: "Timer", title: t("feature1Title"), description: t("feature1Body") },
        { icon: "Bike", title: t("feature2Title"), description: t("feature2Body") },
        { icon: "Percent", title: t("feature3Title"), description: t("feature3Body") },
      ]}
      sort={sort}
      openNow={raw.open === "1"}
      search={typeof raw.q === "string" ? raw.q : ""}
    />
  );
}
