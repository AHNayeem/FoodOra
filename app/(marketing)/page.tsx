import { getTranslations } from "next-intl/server";
import { Hero } from "@/components/sections/hero";
import { CategoryRail } from "@/components/sections/category-rail";
import { SectionHeading } from "@/components/sections/section-heading";
import { VendorCard } from "@/components/cards/vendor-card";
import { getCategories, getCuisines, getTrendingVendors } from "@/services/catalog";

/**
 * Home (Phase C1 — landing). Server component: data is fetched through the
 * async services seam, exactly as it will be against a real backend.
 */
export default async function HomePage() {
  const t = await getTranslations();
  const [categories, trending, cuisines] = await Promise.all([
    getCategories(),
    getTrendingVendors(6),
    getCuisines(),
  ]);

  return (
    <>
      <Hero />

      <section className="container-site py-12">
        <SectionHeading title={t("home.categoriesTitle")} />
        <CategoryRail categories={categories} />
      </section>

      <section className="container-site py-12">
        <SectionHeading
          title={t("home.trendingTitle")}
          subtitle={t("home.trendingSubtitle")}
          seeAllHref="/restaurants"
          seeAllLabel={t("common.seeAll")}
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {trending.map((v) => (
            <VendorCard key={v.id} vendor={v} />
          ))}
        </div>
      </section>

      <section className="container-site py-12 pb-20">
        <SectionHeading title={t("home.cuisinesTitle")} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          {cuisines.map((c) => (
            <a
              key={c.id}
              href={`/search?cuisine=${c.slug}`}
              className="group flex flex-col items-center gap-2 rounded-card bg-surface p-4 shadow-card transition-transform hover:-translate-y-1"
            >
              <span className="text-3xl transition-transform group-hover:scale-110">
                {c.emoji}
              </span>
              <span className="text-sm font-medium text-ink">{c.name}</span>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
