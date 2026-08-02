import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getCareersContent } from "@/services/pages";
import { getRouteMetadata, readOptions } from "@/services/cms";
import { PageHero, ValueGrid } from "@/components/marketing/marketing-blocks";
import { JobBoard } from "@/components/marketing/job-board";
import { SectionHeading } from "@/components/sections/section-heading";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return getRouteMetadata("/careers", readOptions(locale, (key) => t(key)), {
    title: t("careers.metaTitle"),
    description: t("careers.metaDescription"),
  });
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Careers (spec: CMS — Landing Pages). Open roles are rows of the `careers` CMS
 * document and the team filter lives in the URL, so a filtered list is shareable.
 * Applying is a mailto in the prototype — the ATS integration is a later concern.
 */
export default async function CareersPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const [t, locale] = await Promise.all([getTranslations("careers"), getLocale()]);
  const root = await getTranslations();
  const content = await getCareersContent({ locale, translate: (key) => root(key) });

  const activeTeam = typeof raw.team === "string" ? raw.team : "";

  return (
    <div className="pb-16">
      <PageHero
        eyebrow={content.hero.eyebrow || t("eyebrow")}
        title={content.hero.title || t("title")}
        lead={content.hero.lead}
        docKey="careers"
      />

      {/* Perks */}
      <section className="container-site py-14">
        <SectionHeading title={t("perksTitle")} subtitle={t("perksSubtitle")} />
        <ValueGrid
          items={content.perks}
          columns={2}
          cms={{ docKey: "careers", field: "perks" }}
        />
      </section>

      {/* Openings */}
      <section className="border-t border-line bg-surface-muted py-14">
        <div className="container-site">
          <JobBoard jobs={content.jobs} activeTeam={activeTeam} />

          <p className="mt-8 text-body">
            {t("noFitBody")}{" "}
            <a
              href="mailto:jobs@foodora.example.com"
              className="font-semibold text-primary hover:underline"
            >
              jobs@foodora.example.com
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
