import type { MetadataRoute } from "next";
import { siteConfig } from "@/constants/site";
import { cateringServices, mealPlans, posts, vendors } from "@/lib/mock";

/**
 * Sitemap — every indexable route: the marketing and legal pages, each vertical
 * directory, plus vendor, caterer, meal-plan and article detail pages. Detail URLs come
 * from the seed so the sitemap stays in step with `generateStaticParams`.
 *
 * `/search` is deliberately absent: it is query-driven and marked `noindex`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url;

  /** Static routes with their crawl hints. */
  const staticRoutes: {
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }[] = [
    { path: "", changeFrequency: "daily", priority: 1 },
    // Discovery
    { path: "/restaurants", changeFrequency: "daily", priority: 0.9 },
    { path: "/cafes", changeFrequency: "daily", priority: 0.8 },
    { path: "/cloud-kitchens", changeFrequency: "daily", priority: 0.8 },
    { path: "/home-chefs", changeFrequency: "daily", priority: 0.8 },
    { path: "/meal-plans", changeFrequency: "weekly", priority: 0.8 },
    { path: "/reservations", changeFrequency: "daily", priority: 0.8 },
    { path: "/catering", changeFrequency: "weekly", priority: 0.8 },
    { path: "/offers", changeFrequency: "daily", priority: 0.8 },
    { path: "/ai", changeFrequency: "monthly", priority: 0.7 },
    // Editorial
    { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
    // Company
    { path: "/about", changeFrequency: "monthly", priority: 0.5 },
    { path: "/careers", changeFrequency: "weekly", priority: 0.5 },
    { path: "/help", changeFrequency: "monthly", priority: 0.6 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
    // Acquisition
    { path: "/partner", changeFrequency: "monthly", priority: 0.7 },
    { path: "/rider", changeFrequency: "monthly", priority: 0.7 },
    // Legal
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/refund", changeFrequency: "yearly", priority: 0.3 },
  ];

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${base}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const vendorEntries: MetadataRoute.Sitemap = vendors
    .filter((v) => !v.deletedAt)
    .map((v) => ({
      url: `${base}/restaurants/${v.slug}`,
      changeFrequency: "daily",
      priority: 0.6,
    }));

  const cateringEntries: MetadataRoute.Sitemap = cateringServices
    .filter((s) => !s.deletedAt)
    .map((s) => ({
      url: `${base}/catering/${s.slug}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  const planEntries: MetadataRoute.Sitemap = mealPlans
    .filter((p) => !p.deletedAt)
    .map((p) => ({
      url: `${base}/meal-plans/${p.slug}`,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  const postEntries: MetadataRoute.Sitemap = posts
    .filter((p) => !p.deletedAt)
    .map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(p.publishedAt),
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  return [
    ...staticEntries,
    ...vendorEntries,
    ...cateringEntries,
    ...planEntries,
    ...postEntries,
  ];
}
