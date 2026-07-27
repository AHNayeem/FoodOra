import type { MetadataRoute } from "next";
import { siteConfig } from "@/constants/site";
import { vendors } from "@/lib/mock";

/** Sitemap — static marketing routes + vendor detail pages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/restaurants", "/cafes", "/home-chefs", "/offers", "/about"];
  const base = siteConfig.url;

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));

  const vendorEntries: MetadataRoute.Sitemap = vendors.map((v) => ({
    url: `${base}/restaurants/${v.slug}`,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [...staticEntries, ...vendorEntries];
}
