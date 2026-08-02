import type {
  FaqGroup,
  HowStep,
  JobOpening,
  LegalDoc,
  StatItem,
  SupportChannel,
  TimelineEntry,
  ValueProp,
} from "@/frontend/types";
import {
  liveReader,
  toJobs,
  toPageHero,
  toStats,
  toSteps,
  toSupportChannels,
  toTimeline,
  toValueProps,
  type CmsPageHero,
} from "@/frontend/lib/cms";
import {
  emptyCmsContext,
  getFaqGroupsFor,
  getLegalDocument,
  pageDocument,
  readOptions,
  type CmsContext,
} from "./cms";
import { mockDelay } from "./http";

/**
 * pages.ts — read API for the marketing and legal pages.
 *
 * Since C26 these are **projections of CMS documents** rather than getters over
 * the seed arrays: `getAboutContent()` reads the `about` document, and the
 * document's seed is derived from those same arrays (`lib/mock/cms.ts`), so no
 * prose exists twice and the page cannot disagree with what the editor sees. The
 * signatures did not change, which was the point of putting a seam here in C1.
 *
 * Callers pass the request's locale and a translator, because a document may
 * hold either authored text or an i18n key per field (`resolveText`). Everything
 * else about the contract is the same as before.
 */
export interface CmsPageOptions {
  locale?: string;
  /** Resolves a field's fallback message key — `getTranslations()` / `useTranslations()`. */
  translate?: (key: string) => string;
  /** The device's unpublished/locally-published edits, when there are any. */
  ctx?: CmsContext;
}

/** The heading band every marketing page opens with. */
export type PageHeroContent = CmsPageHero;

const EMPTY_HERO: PageHeroContent = { eyebrow: "", title: "", lead: "" };

function resolve(options: CmsPageOptions) {
  return {
    ctx: options.ctx ?? emptyCmsContext,
    read: readOptions(options.locale, options.translate),
  };
}

/** The about page: hero, story, values, stats and timeline. */
export interface AboutContent {
  hero: PageHeroContent;
  story: string[];
  values: ValueProp[];
  stats: StatItem[];
  timeline: TimelineEntry[];
}

export async function getAboutContent(options: CmsPageOptions = {}): Promise<AboutContent> {
  const { ctx, read } = resolve(options);
  const doc = pageDocument("about", ctx);
  if (!doc) return mockDelay({ hero: EMPTY_HERO, story: [], values: [], stats: [], timeline: [] });

  return mockDelay({
    hero: toPageHero(doc, read),
    story: liveReader(doc, read).paragraphs("story"),
    values: toValueProps(doc, "values", read),
    stats: toStats(doc, "stats", read),
    timeline: toTimeline(doc, read),
  });
}

/** The help centre: hero, contact channels and grouped FAQs. */
export interface HelpContent {
  hero: PageHeroContent;
  channels: SupportChannel[];
  faqs: FaqGroup[];
}

export async function getHelpContent(options: CmsPageOptions = {}): Promise<HelpContent> {
  const { ctx, read } = resolve(options);
  const doc = pageDocument("help", ctx);
  const faqs = await getFaqGroupsFor("help", ctx, read);

  return mockDelay({
    hero: doc ? toPageHero(doc, read) : EMPTY_HERO,
    channels: doc ? toSupportChannels(doc, read) : [],
    faqs,
  });
}

/** The careers page: hero, perks and every open role. */
export interface CareersContent {
  hero: PageHeroContent;
  perks: ValueProp[];
  jobs: JobOpening[];
}

export async function getCareersContent(options: CmsPageOptions = {}): Promise<CareersContent> {
  const { ctx, read } = resolve(options);
  const doc = pageDocument("careers", ctx);
  if (!doc) return mockDelay({ hero: EMPTY_HERO, perks: [], jobs: [] });

  return mockDelay({
    hero: toPageHero(doc, read),
    perks: toValueProps(doc, "perks", read),
    jobs: toJobs(doc, read),
  });
}

/** A recruitment landing page — shared shape for `/partner` and `/rider`. */
export interface PitchContent {
  hero: PageHeroContent;
  stats: StatItem[];
  values: ValueProp[];
  steps: HowStep[];
  faqs: FaqGroup[];
}

async function pitchContent(
  key: "partner" | "rider",
  options: CmsPageOptions,
): Promise<PitchContent> {
  const { ctx, read } = resolve(options);
  const doc = pageDocument(key, ctx);
  const faqs = await getFaqGroupsFor(key, ctx, read);
  if (!doc) return mockDelay({ hero: EMPTY_HERO, stats: [], values: [], steps: [], faqs });

  return mockDelay({
    hero: toPageHero(doc, read),
    stats: toStats(doc, "stats", read),
    values: toValueProps(doc, "values", read),
    steps: toSteps(doc, "steps", read),
    faqs,
  });
}

export function getPartnerContent(options: CmsPageOptions = {}): Promise<PitchContent> {
  return pitchContent("partner", options);
}

export function getRiderContent(options: CmsPageOptions = {}): Promise<PitchContent> {
  return pitchContent("rider", options);
}

/** A legal document by slug (`terms`, `privacy`, `refund`) — `null` when unknown. */
export function getLegalDoc(slug: string, options: CmsPageOptions = {}): Promise<LegalDoc | null> {
  const { ctx, read } = resolve(options);
  return getLegalDocument(slug, ctx, read);
}
