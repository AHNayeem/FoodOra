/**
 * content.ts — editorial / social-proof content surfaced on the marketing site
 * (testimonials, blog). Like vendor names and taglines, the human-authored copy
 * (quotes, post titles) lives on the entity as data — only the surrounding UI
 * chrome is translated. Both map 1:1 onto future CMS models (spec: Blog Posts).
 */
import type { BaseEntity } from "./common";

/** A customer testimonial shown in the "loved by" social-proof rail. */
export interface Testimonial extends BaseEntity {
  /** Customer display name. */
  name: string;
  /** Short role/context line, e.g. "Foodie, Dhaka". */
  role: string;
  /** Avatar image URL. */
  avatar: string;
  /** The quote itself. */
  quote: string;
  /** 1–5 star rating the customer left. */
  rating: number;
}

/** A blog / editorial post teaser for the landing "from the blog" section. */
export interface BlogPost extends BaseEntity {
  slug: string;
  title: string;
  excerpt: string;
  /** Cover image URL. */
  cover: string;
  /** Editorial category label, e.g. "Guides". */
  category: string;
  author: string;
  /** Estimated read time in minutes. */
  readMinutes: number;
  /** ISO date the post was published. */
  publishedAt: string;
}
