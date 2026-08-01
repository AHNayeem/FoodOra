import { postCategories, posts, postBySlug, testimonials } from "@/lib/mock";
import type { BlogPost, Testimonial } from "@/types";
import { mockDelay } from "./http";

/**
 * content.ts — read API for editorial/social-proof content (testimonials,
 * blog). Backend-ready async signatures over the mock seed, exactly like
 * `catalog.ts`. When a CMS lands, only this file changes.
 */

export async function getTestimonials(limit?: number): Promise<Testimonial[]> {
  const list = testimonials.filter((t) => !t.deletedAt);
  return mockDelay(limit ? list.slice(0, limit) : list);
}

export async function getBlogPosts(limit?: number): Promise<BlogPost[]> {
  const list = posts
    .filter((p) => !p.deletedAt)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return mockDelay(limit ? list.slice(0, limit) : list);
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  return mockDelay(postBySlug.get(slug) ?? null);
}

/** Post slugs for `generateStaticParams` — synchronous, build-time only. */
export function getBlogPostSlugs(): string[] {
  return posts.filter((p) => !p.deletedAt).map((p) => p.slug);
}

/** Category names with post counts, for the blog index filter. */
export async function getBlogCategories(): Promise<{ name: string; count: number }[]> {
  return mockDelay(postCategories);
}

/**
 * Posts related to `slug` — ranked by shared tags, then by category, then by
 * recency, so a thin tag overlap still yields a sensible rail.
 */
export async function getRelatedPosts(slug: string, limit = 3): Promise<BlogPost[]> {
  const post = postBySlug.get(slug);
  if (!post) return mockDelay([]);

  const scored = posts
    .filter((p) => !p.deletedAt && p.slug !== slug)
    .map((p) => ({
      post: p,
      score:
        p.tags.filter((tag) => post.tags.includes(tag)).length * 2 +
        (p.category === post.category ? 1 : 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.post.publishedAt) - Date.parse(a.post.publishedAt),
    )
    .slice(0, limit)
    .map((entry) => entry.post);

  return mockDelay(scored);
}
