import { posts, testimonials } from "@/lib/mock";
import type { BlogPost, Testimonial } from "@/types";
import { cmsPosts, emptyCmsContext, readOptions, type CmsContext } from "./cms";
import { mockDelay } from "./http";

/**
 * content.ts — read API for editorial / social-proof content.
 *
 * Since C26 the blog is served from the CMS: a post is a `posts` document
 * (seeded from `lib/mock/posts.ts`, so the corpus is unchanged) and everything
 * below projects it. Testimonials stay on the seed — they are quotes attributed
 * to real customers, which is not content an operator should be able to rewrite.
 */
export interface ContentOptions {
  locale?: string;
  translate?: (key: string) => string;
  ctx?: CmsContext;
}

function resolve(options: ContentOptions = {}) {
  return {
    ctx: options.ctx ?? emptyCmsContext,
    read: readOptions(options.locale, options.translate),
  };
}

export async function getTestimonials(limit?: number): Promise<Testimonial[]> {
  const list = testimonials.filter((t) => !t.deletedAt);
  return mockDelay(limit ? list.slice(0, limit) : list);
}

/** Published posts, newest first. */
export async function getBlogPosts(limit?: number, options: ContentOptions = {}): Promise<BlogPost[]> {
  const { ctx, read } = resolve(options);
  const list = cmsPosts(ctx, read);
  return mockDelay(limit ? list.slice(0, limit) : list);
}

export async function getBlogPost(slug: string, options: ContentOptions = {}): Promise<BlogPost | null> {
  const { ctx, read } = resolve(options);
  return mockDelay(cmsPosts(ctx, read).find((post) => post.slug === slug) ?? null);
}

/**
 * Post slugs for `generateStaticParams` — synchronous, build-time only, and
 * deliberately read from the seed rather than the CMS: prerendering happens
 * before any device has edited anything, and an article added in the admin is
 * rendered on demand.
 */
export function getBlogPostSlugs(): string[] {
  return posts.filter((p) => !p.deletedAt).map((p) => p.slug);
}

/** Category names with post counts, for the blog index filter. */
export async function getBlogCategories(
  options: ContentOptions = {},
): Promise<{ name: string; count: number }[]> {
  const { ctx, read } = resolve(options);
  const counts = new Map<string, number>();

  for (const post of cmsPosts(ctx, read)) {
    counts.set(post.category, (counts.get(post.category) ?? 0) + 1);
  }

  const list = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return mockDelay(list);
}

/**
 * Posts related to `slug` — ranked by shared tags, then by category, then by
 * recency, so a thin tag overlap still yields a sensible rail.
 */
export async function getRelatedPosts(
  slug: string,
  limit = 3,
  options: ContentOptions = {},
): Promise<BlogPost[]> {
  const { ctx, read } = resolve(options);
  const all = cmsPosts(ctx, read);
  const post = all.find((p) => p.slug === slug);
  if (!post) return mockDelay([]);

  const scored = all
    .filter((p) => p.slug !== slug)
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
