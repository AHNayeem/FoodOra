import { posts, postBySlug, testimonials } from "@/lib/mock";
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
