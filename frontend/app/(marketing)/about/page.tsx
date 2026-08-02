import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getAboutContent } from "@/services/pages";
import { getRouteMetadata, readOptions } from "@/services/cms";
import {
  PageHero,
  Paragraphs,
  StatsBand,
  TimelineBand,
  ValueGrid,
} from "@/components/marketing/marketing-blocks";
import { SectionHeading } from "@/components/sections/section-heading";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return getRouteMetadata("/about", readOptions(locale, (key) => t(key)), {
    title: t("about.metaTitle"),
    description: t("about.metaDescription"),
  });
}

/**
 * About (spec: CMS — About). Mission, the story so far, what we optimise for,
 * and the timeline. All content comes from the pages seam, so a CMS can own it
 * without this file changing.
 */
export default async function AboutPage() {
  const [t, locale] = await Promise.all([getTranslations("about"), getLocale()]);
  const root = await getTranslations();
  const content = await getAboutContent({ locale, translate: (key) => root(key) });

  return (
    <div className="pb-16">
      <PageHero
        eyebrow={content.hero.eyebrow || t("eyebrow")}
        title={content.hero.title || t("title")}
        lead={content.hero.lead}
        docKey="about"
      />

      {/* Stats */}
      <section className="container-site -mt-8 md:-mt-10">
        <StatsBand stats={content.stats} cms={{ docKey: "about", field: "stats" }} />
      </section>

      {/* Story */}
      <section className="container-site py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <SectionHeading title={t("storyTitle")} subtitle={t("storySubtitle")} />
          <Paragraphs paragraphs={content.story} cms={{ docKey: "about", field: "story" }} />
        </div>
      </section>

      {/* Values */}
      <section className="border-y border-line bg-surface-muted py-14">
        <div className="container-site">
          <SectionHeading title={t("valuesTitle")} subtitle={t("valuesSubtitle")} />
          <ValueGrid
            items={content.values}
            columns={2}
            cms={{ docKey: "about", field: "values" }}
          />
        </div>
      </section>

      {/* Timeline */}
      <section className="container-site py-14">
        <SectionHeading title={t("timelineTitle")} subtitle={t("timelineSubtitle")} />
        <TimelineBand entries={content.timeline} docKey="about" />
      </section>

      {/* CTA */}
      <section className="container-site">
        <div className="flex flex-col items-start gap-5 rounded-panel bg-ink p-8 text-white md:flex-row md:items-center md:justify-between md:p-10">
          <div>
            <h2 className="text-h2">{t("ctaTitle")}</h2>
            <p className="mt-2 max-w-xl text-white/70">{t("ctaBody")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button href="/careers" size="lg">
              {t("ctaJobs")}
            </Button>
            <Link
              href="/partner"
              className="inline-flex h-13 items-center rounded-pill border border-white/25 px-7 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              {t("ctaPartner")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
