import { getTranslations } from "next-intl/server";
import { Hero } from "@/components/sections/hero";
import { CategoryRail } from "@/components/sections/category-rail";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Testimonials } from "@/components/sections/testimonials";
import { AppDownload } from "@/components/sections/app-download";
import { BlogTeaser } from "@/components/sections/blog-teaser";
import { SectionHeading } from "@/components/sections/section-heading";
import { VendorCard } from "@/components/cards/vendor-card";
import { getCategories, getCuisines, getTrendingVendors } from "@/services/catalog";
import { getBlogPosts, getTestimonials } from "@/services/content";

/**
 * Home (Phase C1 — landing). Server component: all data is fetched through the
 * async services seam, exactly as it will be against a real backend.
 */
export default async function HomePage() {
  const t = await getTranslations();
  const [categories, trending, cuisines, testimonials, posts] = await Promise.all([
    getCategories(),
    getTrendingVendors(6),
    getCuisines(),
    getTestimonials(6),
    getBlogPosts(3),
  ]);

  return (
    <>
      <Hero />

      <section className="container-site py-12">
        <SectionHeading title={t("home.categoriesTitle")} />
        <CategoryRail categories={categories} />
      </section>

      <HowItWorks />

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

      <section className="container-site py-12">
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

      <Testimonials items={testimonials} />

      <AppDownload />

      <BlogTeaser posts={posts} />
    </>
  );
}
