"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Briefcase, MapPin, Users } from "lucide-react";
import type { JobOpening } from "@/types";
import { useCmsJobs } from "@/components/marketing/marketing-blocks";
import { SectionHeading } from "@/components/sections/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * JobBoard — the open roles on `/careers`, with the team filter.
 *
 * The filter stays in the URL so a filtered list is shareable (the page reads it
 * and passes it down); the roles themselves are rows of the `careers` CMS
 * document, so adding one is an edit rather than a deploy. The team chips are
 * derived from whatever roles are published, which is why they are drawn here
 * and not on the server: a role added on this device brings its team with it.
 */
export function JobBoard({ jobs, activeTeam }: { jobs: JobOpening[]; activeTeam: string }) {
  const t = useTranslations("careers");
  const published = useCmsJobs(jobs);

  const teams = Array.from(new Set(published.map((job) => job.team))).sort();
  const team = teams.includes(activeTeam) ? activeTeam : "";
  const visible = team ? published.filter((job) => job.team === team) : published;

  return (
    <>
      <SectionHeading
        title={t("openingsTitle")}
        subtitle={t("openingsCount", { count: published.length })}
      />

      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <TeamChip href="/careers" active={team === ""}>
          {t("allTeams")}
        </TeamChip>
        {teams.map((name) => (
          <TeamChip
            key={name}
            href={`/careers?team=${encodeURIComponent(name)}`}
            active={team === name}
          >
            {name}
          </TeamChip>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line bg-surface py-16 text-center">
          <Briefcase className="size-10 text-muted" aria-hidden />
          <p className="text-lg font-semibold text-ink">{t("emptyTitle")}</p>
          <p className="max-w-sm text-body">{t("emptyBody")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((job) => (
            <li
              key={job.id}
              className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-6 md:flex-row md:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-ink">{job.title}</h3>
                  {job.workplace && <Badge tone="primary">{job.workplace}</Badge>}
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
    </>
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
