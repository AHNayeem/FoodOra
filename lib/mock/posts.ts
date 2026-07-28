import type { BlogPost } from "@/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * Blog / editorial teasers for the landing "from the blog" section. Titles and
 * excerpts are content (not UI strings). Covers are Unsplash (allow-listed).
 * `slug` is stable so posts map onto a future CMS route (`/blog/[slug]`).
 */
export const posts: BlogPost[] = [
  {
    id: "post_street-food",
    slug: "street-food-guide-dhaka",
    title: "A first-timer's guide to Dhaka street food",
    excerpt:
      "From fuchka carts to late-night kebab rolls — the ten bites you can now order without leaving your seat.",
    cover:
      "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=1200&q=80",
    category: "Guides",
    author: "The FoodOra Kitchen",
    readMinutes: 6,
    publishedAt: "2026-07-10T09:00:00.000Z",
    ...base,
  },
  {
    id: "post_home-chefs",
    slug: "meet-the-home-chefs",
    title: "Meet the home chefs cooking your next favourite meal",
    excerpt:
      "Behind every home-kitchen listing is a person and a recipe. We sat down with three of the most-loved.",
    cover:
      "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80",
    category: "Community",
    author: "Leila Haddad",
    readMinutes: 8,
    publishedAt: "2026-07-03T09:00:00.000Z",
    ...base,
  },
  {
    id: "post_track-order",
    slug: "how-live-tracking-works",
    title: "How live order tracking actually works",
    excerpt:
      "The little map that tells you your food is two minutes away — here's the thinking behind that dot.",
    cover:
      "https://images.unsplash.com/photo-1526367790999-0150786686a2?auto=format&fit=crop&w=1200&q=80",
    category: "Product",
    author: "The FoodOra Team",
    readMinutes: 4,
    publishedAt: "2026-06-24T09:00:00.000Z",
    ...base,
  },
];

export const postBySlug = new Map(posts.map((p) => [p.slug, p]));
