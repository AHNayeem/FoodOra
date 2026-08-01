import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Briefcase, MapPin, Users } from "lucide-react";
import { getCareersContent } from "@/services/pages";
import { PageHero, ValueGrid } from "@/components/marketing/marketing-blocks";
import { SectionHeading } from "@/components/sections/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("careers");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/careers" },
  };
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Careers (spec: CMS — Landing Pages). Open roles come from the pages seam and
 * the team filter lives in the URL, so a filtered list is shareable. Applying is
 * a mailto in the prototype — the ATS integration is a later concern.
 */
export default async function CareersPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const [content, t] = await Promise.all([getCareersContent(), getTranslations("careers")]);

  const teams = Array.from(new Set(content.jobs.map((j) => j.team))).sort();
  const requested = typeof raw.team === "string" ? raw.team : "";
  const activeTeam = teams.includes(requested) ? requested : "";
  const jobs = activeTeam ? content.jobs.filter((j) => j.team === activeTeam) : content.jobs;

  return (
    <div className="pb-16">
      <PageHero eyebrow={t("eyebrow")} title={t("title")} lead={content.intro} />

      {/* Perks */}
      <section className="container-site py-14">
        <SectionHeading title={t("perksTitle")} subtitle={t("perksSubtitle")} />
        <ValueGrid items={content.perks} columns={2} />
      </section>

      {/* Openings */}
      <section className="border-t border-line bg-surface-muted py-14">
        <div className="container-site">
          <SectionHeading
            title={t("openingsTitle")}
            subtitle={t("openingsCount", { count: content.jobs.length })}
          />

          {/* Team filter */}
          <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            <TeamChip href="/careers" active={activeTeam === ""}>
              {t("allTeams")}
            </TeamChip>
            {teams.map((team) => (
              <TeamChip
                key={team}
                href={`/careers?team=${encodeURIComponent(team)}`}
                active={activeTeam === team}
              >
                {team}
              </TeamChip>
            ))}
          </div>

          {jobs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line bg-surface py-16 text-center">
              <Briefcase className="size-10 text-muted" aria-hidden />
              <p className="text-lg font-semibold text-ink">{t("emptyTitle")}</p>
              <p className="max-w-sm text-body">{t("emptyBody")}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-6 md:flex-row md:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-ink">{job.title}</h3>
                      <Badge tone="primary">{job.workplace}</Badge>
                    </div>
                    <p className="mt-2 text-body">{job.summary}</p>
                    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
                      <div className="inline-flex items-center gap-1.5">
                        <Users className="size-4" aria-hidden />
                        <dt className="sr-only">{t("teamLabel")}</dt>
                        <dd>{job.team}</dd>
                      </div>
                      <div className="inline-flex items-center gap-1.5">
                        <MapPin className="size-4" aria-hidden />
                        <dt className="sr-only">{t("locationLabel")}</dt>
                        <dd>{job.location}</dd>
                      </div>
                      <div className="inline-flex items-center gap-1.5">
                        <Briefcase className="size-4" aria-hidden />
                        <dt className="sr-only">{t("employmentLabel")}</dt>
                        <dd>{job.employment}</dd>
                      </div>
                    </dl>
                  </div>
                  <Button
                    href={`mailto:jobs@foodora.example.com?subject=${encodeURIComponent(job.title)}`}
                    variant="outline"
                    className="shrink-0"
                  >
                    {t("apply")}
                  </Button>
                </li>
              ))}
            </ul>
          )}

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

function TeamChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex h-10 shrink-0 items-center rounded-pill border border-primary bg-primary px-4 text-sm font-semibold text-white"
          : "inline-flex h-10 shrink-0 items-center rounded-pill border border-line bg-surface px-4 text-sm font-semibold text-body hover:border-primary hover:text-primary"
      }
    >
      {children}
    </Link>
  );
}
