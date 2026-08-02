import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VendorDirectory } from "@/frontend/components/directory/vendor-directory";
import type { SortKey } from "@/frontend/components/filters/vendor-filters";

const SORTS = new Set<SortKey>(["recommended", "rating", "delivery-time", "distance"]);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cafes");
  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: { canonical: "/cafes" },
  };
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Cafe Directory (spec: Cafe Directory). The vendor type is pinned by the route;
 * the remaining facets (sort, open-now, search) stay in the URL so results are
 * shareable, exactly as on the general directory.
 */
export default async function CafesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const t = await getTranslations("cafes");

  const sortParam = typeof raw.sort === "string" ? raw.sort : "";
  const sort = SORTS.has(sortParam as SortKey) ? (sortParam as SortKey) : "recommended";

  return (
    <VendorDirectory
      type="cafe"
      title={t("title")}
      subtitle={t("subtitle")}
      features={[
        { icon: "Coffee", title: t("feature1Title"), description: t("feature1Body") },
        { icon: "Clock", title: t("feature2Title"), description: t("feature2Body") },
        { icon: "Leaf", title: t("feature3Title"), description: t("feature3Body") },
      ]}
      sort={sort}
      openNow={raw.open === "1"}
      search={typeof raw.q === "string" ? raw.q : ""}
    />
  );
}
