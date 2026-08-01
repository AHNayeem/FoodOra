import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getAboutContent } from "@/services/pages";
import {
  PageHero,
  StatsBand,
  ValueGrid,
} from "@/components/marketing/marketing-blocks";
import { SectionHeading } from "@/components/sections/section-heading";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/about" },
  };
}

/**
 * About (spec: CMS — About). Mission, the story so far, what we optimise for,
 * and the timeline. All content comes from the pages seam, so a CMS can own it
 * without this file changing.
 */
export default async function AboutPage() {
  const [content, t] = await Promise.all([getAboutContent(), getTranslations("about")]);

  return (
    <div className="pb-16">
      <PageHero eyebrow={t("eyebrow")} title={t("title")} lead={content.mission} />

      {/* Stats */}
      <section className="container-site -mt-8 md:-mt-10">
        <StatsBand stats={content.stats} />
      </section>

      {/* Story */}
      <section className="container-site py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <SectionHeading title={t("storyTitle")} subtitle={t("storySubtitle")} />
          <div className="flex flex-col gap-5">
            {content.story.map((paragraph) => (
              <p key={paragraph} className="text-lg leading-relaxed text-body">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="border-y border-line bg-surface-muted py-14">
        <div className="container-site">
          <SectionHeading title={t("valuesTitle")} subtitle={t("valuesSubtitle")} />
          <ValueGrid items={content.values} columns={2} />
        </div>
      </section>

      {/* Timeline */}
      <section className="container-site py-14">
        <SectionHeading title={t("timelineTitle")} subtitle={t("timelineSubtitle")} />
        <ol className="relative flex flex-col gap-8 border-s border-line ps-6">
          {content.timeline.map((entry) => (
            <li key={entry.year} className="relative">
              <span
                aria-hidden
                className="absolute -start-[1.8rem] top-1.5 size-3 rounded-pill border-2 border-surface bg-primary"
              />
              <p className="text-sm font-bold text-primary">{entry.year}</p>
              <h3 className="mt-1 text-lg font-bold text-ink">{entry.title}</h3>
              <p className="mt-1 max-w-2xl text-body">{entry.description}</p>
            </li>
          ))}
        </ol>
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
