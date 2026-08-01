import {
  aboutMission,
  aboutStats,
  aboutStory,
  aboutTimeline,
  aboutValues,
  careersIntro,
  careersPerks,
  helpChannels,
  helpFaqs,
  jobOpenings,
  legalDocBySlug,
  partnerFaqs,
  partnerIntro,
  partnerStats,
  partnerSteps,
  partnerValues,
  riderFaqs,
  riderIntro,
  riderStats,
  riderSteps,
  riderValues,
} from "@/lib/mock";
import type {
  FaqGroup,
  HowStep,
  JobOpening,
  LegalDoc,
  StatItem,
  SupportChannel,
  TimelineEntry,
  ValueProp,
} from "@/types";
import { mockDelay } from "./http";

/**
 * pages.ts — read API for CMS-managed page content (spec: CMS — Landing Pages,
 * About, Terms, Privacy, FAQs). Each getter returns the whole document a page
 * needs in one call, so swapping the mock for a headless CMS is a change to this
 * file only.
 */

/** The about page: mission, story, values, stats and timeline. */
export interface AboutContent {
  mission: string;
  story: string[];
  values: ValueProp[];
  stats: StatItem[];
  timeline: TimelineEntry[];
}

export async function getAboutContent(): Promise<AboutContent> {
  return mockDelay({
    mission: aboutMission,
    story: aboutStory,
    values: aboutValues,
    stats: aboutStats,
    timeline: aboutTimeline,
  });
}

/** The help centre: contact channels plus grouped FAQs. */
export interface HelpContent {
  channels: SupportChannel[];
  faqs: FaqGroup[];
}

export async function getHelpContent(): Promise<HelpContent> {
  return mockDelay({ channels: helpChannels, faqs: helpFaqs });
}

/** The careers page: intro, perks and every open role. */
export interface CareersContent {
  intro: string;
  perks: ValueProp[];
  jobs: JobOpening[];
}

export async function getCareersContent(): Promise<CareersContent> {
  return mockDelay({
    intro: careersIntro,
    perks: careersPerks,
    jobs: jobOpenings.filter((j) => !j.deletedAt),
  });
}

/** A recruitment landing page — shared shape for `/partner` and `/rider`. */
export interface PitchContent {
  intro: string;
  stats: StatItem[];
  values: ValueProp[];
  steps: HowStep[];
  faqs: FaqGroup[];
}

export async function getPartnerContent(): Promise<PitchContent> {
  return mockDelay({
    intro: partnerIntro,
    stats: partnerStats,
    values: partnerValues,
    steps: partnerSteps,
    faqs: partnerFaqs,
  });
}

export async function getRiderContent(): Promise<PitchContent> {
  return mockDelay({
    intro: riderIntro,
    stats: riderStats,
    values: riderValues,
    steps: riderSteps,
    faqs: riderFaqs,
  });
}

/** A legal document by slug (`terms`, `privacy`) — `null` when unknown. */
export async function getLegalDoc(slug: string): Promise<LegalDoc | null> {
  const doc = legalDocBySlug.get(slug);
  return mockDelay(doc && !doc.deletedAt ? doc : null);
}
