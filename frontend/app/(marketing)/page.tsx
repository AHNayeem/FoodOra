import { getLocale, getTranslations } from "next-intl/server";
import { Hero } from "@/frontend/components/sections/hero";
import { CategoryRail } from "@/frontend/components/sections/category-rail";
import { HowItWorks } from "@/frontend/components/sections/how-it-works";
import { Testimonials } from "@/frontend/components/sections/testimonials";
import { AppDownload } from "@/frontend/components/sections/app-download";
import { BlogTeaser } from "@/frontend/components/sections/blog-teaser";
import { SectionHeading } from "@/frontend/components/sections/section-heading";
import { PromoStrip } from "@/frontend/components/cms/promo-strip";
import { VendorCard } from "@/frontend/components/cards/vendor-card";
import { getCategories, getCuisines, getTrendingVendors } from "@/frontend/services/catalog";
import { getBlogPosts, getTestimonials } from "@/frontend/services/content";
import { getBanners, readOptions } from "@/frontend/services/cms";

/**
 * Home (Phase C1 — landing). Server component: all data is fetched through the
 * async services seam, exactly as it will be against a real backend.
 *
 * Since C26 the hero, the promotional strip and the craving rail are CMS
 * documents (spec: CMS — Homepage, Hero Banner, Promotions, Categories), so
 * everything above the fold is editable without touching this file.
 */
export default async function HomePage() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const options = readOptions(locale, (key) => t(key));
  const pageOptions = { locale, translate: (key: string) => t(key) };

  const [heroBanners, promos, categories, trending, cuisines, testimonials, posts] =
    await Promise.all([
      getBanners("home-hero", undefined, options),
      getBanners("home-strip", undefined, options),
      getCategories(pageOptions),
      getTrendingVendors(6),
      getCuisines(),
      getTestimonials(6),
      getBlogPosts(3, pageOptions),
    ]);

  return (
    <>
      <Hero banner={heroBanners[0] ?? null} />

      <section className="container-site py-12">
        <SectionHeading title={t("home.categoriesTitle")} />
        <CategoryRail categories={categories} />
      </section>

      <section className="container-site">
        <PromoStrip placement="home-strip" banners={promos} />
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
              <span className="text-3xl transition-transform group-hover:scale-110">{c.emoji}</span>
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
