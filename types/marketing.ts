/**
 * marketing.ts — the content models behind the static marketing and legal pages
 * (spec: CMS — Landing Pages, About, Terms, Privacy, FAQs, everything editable).
 *
 * These pages carry no hardcoded copy in their components: each one renders a
 * document served through `services/pages.ts`, so a CMS can later own the exact
 * same shapes without touching a single page.
 */
import type { BaseEntity } from "./common";

/** A heading + paragraphs block inside a long-form document. */
export interface DocSection {
  /** Anchor id, used by the on-page contents list. */
  id: string;
  heading: string;
  /** Body paragraphs, rendered in order. */
  paragraphs: string[];
  /** Optional bullet list rendered after the paragraphs. */
  bullets?: string[];
}

/** A legal document — terms, privacy, refund policy. */
export interface LegalDoc extends BaseEntity {
  slug: string;
  title: string;
  /** Lead paragraph above the contents list. */
  intro: string;
  /** ISO date the document was last revised. */
  effectiveFrom: string;
  sections: DocSection[];
}

/** One question/answer pair. */
export interface FaqItem {
  question: string;
  answer: string;
}

/** A group of FAQs under one topic. */
export interface FaqGroup {
  id: string;
  title: string;
  /** Lucide icon name, resolved by `components/directory/dash-icon`. */
  icon: string;
  items: FaqItem[];
}

/** An icon + headline + body trio used across the marketing pages. */
export interface ValueProp {
  /** Lucide icon name. */
  icon: string;
  title: string;
  description: string;
}

/** A headline metric shown in a stats band. */
export interface StatItem {
  /** Pre-formatted display value, e.g. "12,400+". */
  value: string;
  label: string;
}

/** One entry in the "how we got here" timeline on the about page. */
export interface TimelineEntry {
  year: string;
  title: string;
  description: string;
}

/** A numbered step in a "how it works" explainer. */
export interface HowStep {
  /** Lucide icon name. */
  icon: string;
  title: string;
  description: string;
}

/** An open role on the careers page. */
export interface JobOpening extends BaseEntity {
  slug: string;
  title: string;
  team: string;
  location: string;
  /** Full-time, Part-time, Contract… */
  employment: string;
  /** Remote / Hybrid / On-site. */
  workplace: string;
  summary: string;
}

/** A support channel card on the help page. */
export interface SupportChannel {
  /** Lucide icon name. */
  icon: string;
  title: string;
  description: string;
  /** Displayed action label. */
  actionLabel: string;
  /** Internal route or `mailto:`/`tel:` URI. */
  href: string;
  /** Availability line, e.g. "24/7". */
  availability: string;
}
