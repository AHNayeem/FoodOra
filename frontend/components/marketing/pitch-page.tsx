"use client";

import Link from "next/link";
import type { PitchContent } from "@/services/pages";
import {
  FaqAccordion,
  HowSteps,
  PageHero,
  StatsBand,
  ValueGrid,
} from "@/components/marketing/marketing-blocks";
import { SectionHeading } from "@/components/sections/section-heading";
import { Button } from "@/components/ui/button";

/** The translated chrome a pitch page needs; the page owns its namespace. */
export interface PitchCopy {
  eyebrow: string;
  title: string;
  primaryCta: string;
  secondaryCta: string;
  benefitsTitle: string;
  benefitsSubtitle: string;
  stepsTitle: string;
  stepsSubtitle: string;
  faqTitle: string;
  faqSubtitle: string;
  ctaTitle: string;
  ctaBody: string;
  ctaAction: string;
}

/**
 * PitchPage — the shared body of the two recruitment landing pages, `/partner`
 * (vendors) and `/rider` (couriers). Both need the same shape: a hero with a
 * sign-up call to action, headline numbers, benefits, how it works, FAQs and a
 * closing CTA. Content arrives from the pages seam and chrome from the page's
 * own namespace, so neither page holds layout or copy.
 *
 * Sign-up posts nowhere in the prototype — the CTAs route to registration,
 * which is where the real onboarding flow will begin.
 */
export function PitchPage({
  content,
  copy,
  docKey,
  signUpHref,
  secondaryHref,
  appLink,
}: {
  content: PitchContent;
  copy: PitchCopy;
  /** Which page document backs it — `partner` or `rider`. */
  docKey: "partner" | "rider";
  signUpHref: string;
  secondaryHref: string;
  /**
   * "Already signed up? Open the app." Only `/rider` passes this today — the
   * rider app (C18) exists, so the recruitment page should let an existing
   * partner walk straight into it rather than back to registration.
   */
  appLink?: { href: string; label: string };
}) {
  return (
    <div className="pb-16">
      <PageHero
        eyebrow={copy.eyebrow}
        title={copy.title}
        lead={content.hero.lead}
        docKey={docKey}
      >
        <div className="flex flex-wrap gap-3">
          <Button href={signUpHref} size="lg">
            {copy.primaryCta}
          </Button>
          <Link
            href={secondaryHref}
            className="inline-flex h-13 items-center rounded-pill border border-line bg-surface px-7 text-base font-semibold text-ink transition-colors hover:bg-surface-muted"
          >
            {copy.secondaryCta}
          </Link>
        </div>
        {appLink && (
          <Link
            href={appLink.href}
            className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline"
          >
            {appLink.label}
          </Link>
        )}
      </PageHero>

      <section className="container-site -mt-8 md:-mt-10">
        <StatsBand stats={content.stats} cms={{ docKey, field: "stats" }} />
      </section>

      <section className="container-site py-14">
        <SectionHeading title={copy.benefitsTitle} subtitle={copy.benefitsSubtitle} />
        <ValueGrid items={content.values} cms={{ docKey, field: "values" }} />
      </section>

      <section className="border-y border-line bg-surface-muted py-14">
        <div className="container-site">
          <SectionHeading title={copy.stepsTitle} subtitle={copy.stepsSubtitle} />
          <HowSteps steps={content.steps} cms={{ docKey, field: "steps" }} />
        </div>
      </section>

      <section className="container-site py-14">
        <SectionHeading title={copy.faqTitle} subtitle={copy.faqSubtitle} />
        <div className="max-w-3xl">
          <FaqAccordion groups={content.faqs} surface={docKey} />
        </div>
      </section>

      <section className="container-site">
        <div className="flex flex-col items-start gap-5 rounded-panel bg-ink p-8 text-white md:flex-row md:items-center md:justify-between md:p-10">
          <div>
            <h2 className="text-h2">{copy.ctaTitle}</h2>
            <p className="mt-2 max-w-xl text-white/70">{copy.ctaBody}</p>
          </div>
          <Button href={signUpHref} size="lg" className="shrink-0">
            {copy.ctaAction}
          </Button>
        </div>
      </section>
    </div>
  );
}
