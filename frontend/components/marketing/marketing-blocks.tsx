"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { FaqGroup, HowStep, JobOpening, StatItem, TimelineEntry, ValueProp } from "@/frontend/types";
import {
  toJobs,
  toPageHero,
  toStats,
  toSteps,
  toTimeline,
  toValueProps,
  liveReader,
} from "@/frontend/lib/cms";
import { useCmsFaqGroups, useCmsPageDoc } from "@/frontend/components/cms/use-cms-content";
import { DashIcon } from "@/frontend/components/directory/dash-icon";
import { cn } from "@/frontend/lib/utils";

/**
 * marketing-blocks.tsx — the reusable bands the marketing and legal pages are
 * assembled from (spec: Reusable Components).
 *
 * Each one takes resolved content, so the pages stay thin and none of them holds
 * copy or layout of its own. Since C26 each also takes an optional `cms` handle —
 * the page document and the field it came from — and re-reads that field from the
 * device's own CMS edits. That is the whole of the "editable" wiring: the server
 * still renders the published document, and a band whose content was edited here
 * repaints itself with the edit after hydration.
 */
export interface CmsFieldRef {
  /** Page document key: "about", "careers", "help", "partner", "rider", "contact". */
  docKey: string;
  /** Repeater / text field inside it. */
  field: string;
}

/** PageHero — the shared heading band for a marketing page. */
export function PageHero({
  eyebrow,
  title,
  lead,
  docKey,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  /** Re-reads eyebrow/title/lead from this page document when it has been edited. */
  docKey?: string;
  children?: ReactNode;
}) {
  const { doc, options } = useCmsPageDoc(docKey ?? "");
  const edited = docKey && doc ? toPageHero(doc, options) : null;

  const resolvedEyebrow = edited?.eyebrow || eyebrow;
  const resolvedTitle = edited?.title || title;
  const resolvedLead = edited?.lead || lead;

  return (
    <section className="border-b border-line bg-surface-muted">
      <div className="container-site py-12 md:py-16">
        {resolvedEyebrow && (
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {resolvedEyebrow}
          </p>
        )}
        <h1 className="text-display mt-2 max-w-3xl text-ink">{resolvedTitle}</h1>
        {resolvedLead && <p className="mt-4 max-w-2xl text-lg text-body">{resolvedLead}</p>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

/** Paragraph run from a long-form text field (the about page's story). */
export function Paragraphs({ paragraphs, cms }: { paragraphs: string[]; cms?: CmsFieldRef }) {
  const { doc, options } = useCmsPageDoc(cms?.docKey ?? "");
  const edited = cms && doc ? liveReader(doc, options).paragraphs(cms.field) : null;
  const items = edited?.length ? edited : paragraphs;

  return (
    <div className="flex flex-col gap-5">
      {items.map((paragraph) => (
        <p key={paragraph} className="text-lg leading-relaxed text-body">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/** StatsBand — a row of headline metrics. */
export function StatsBand({ stats, cms }: { stats: StatItem[]; cms?: CmsFieldRef }) {
  const { doc, options } = useCmsPageDoc(cms?.docKey ?? "");
  const edited = cms && doc ? toStats(doc, cms.field, options) : null;
  const items = edited?.length ? edited : stats;

  if (items.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-6 rounded-panel border border-line bg-surface p-6 sm:grid-cols-4 md:p-8">
      {items.map((s) => (
        <div key={s.label}>
          <dt className="sr-only">{s.label}</dt>
          <dd>
            <span className="block text-h2 font-extrabold text-primary">{s.value}</span>
            <span className="mt-1 block text-sm text-body">{s.label}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** ValueGrid — icon + title + body cards, two or three across. */
export function ValueGrid({
  items,
  columns = 3,
  cms,
}: {
  items: ValueProp[];
  columns?: 2 | 3;
  cms?: CmsFieldRef;
}) {
  const { doc, options } = useCmsPageDoc(cms?.docKey ?? "");
  const edited = cms && doc ? toValueProps(doc, cms.field, options) : null;
  const list = edited?.length ? edited : items;

  if (list.length === 0) return null;
  return (
    <ul
      className={cn(
        "grid gap-6",
        columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {list.map((item) => (
        <li key={item.title} className="rounded-panel border border-line bg-surface p-6">
          <span className="inline-flex size-11 items-center justify-center rounded-pill bg-primary/10 text-primary">
            <DashIcon name={item.icon} className="size-5" />
          </span>
          <h3 className="mt-4 text-lg font-bold text-ink">{item.title}</h3>
          <p className="mt-2 text-body">{item.description}</p>
        </li>
      ))}
    </ul>
  );
}

/** HowSteps — numbered steps with connecting rhythm. */
export function HowSteps({ steps, cms }: { steps: HowStep[]; cms?: CmsFieldRef }) {
  const { doc, options } = useCmsPageDoc(cms?.docKey ?? "");
  const edited = cms && doc ? toSteps(doc, cms.field, options) : null;
  const list = edited?.length ? edited : steps;

  if (list.length === 0) return null;
  return (
    <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {list.map((step, i) => (
        <li key={step.title} className="relative rounded-panel bg-surface p-6 shadow-card">
          <span className="absolute end-5 top-5 text-h2 font-extrabold text-line" aria-hidden>
            {i + 1}
          </span>
          <span className="inline-flex size-11 items-center justify-center rounded-pill bg-primary text-white">
            <DashIcon name={step.icon} className="size-5" />
          </span>
          <h3 className="mt-4 font-bold text-ink">{step.title}</h3>
          <p className="mt-2 text-sm text-body">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}

/** TimelineBand — the "how we got here" list on the about page. */
export function TimelineBand({ entries, docKey }: { entries: TimelineEntry[]; docKey?: string }) {
  const { doc, options } = useCmsPageDoc(docKey ?? "");
  const edited = docKey && doc ? toTimeline(doc, options) : null;
  const list = edited?.length ? edited : entries;

  if (list.length === 0) return null;
  return (
    <ol className="relative flex flex-col gap-8 border-s border-line ps-6">
      {list.map((entry) => (
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
  );
}

/** The open roles of the careers document, after any local edit. */
export function useCmsJobs(seed: JobOpening[]): JobOpening[] {
  const { doc, options } = useCmsPageDoc("careers");
  const edited = doc ? toJobs(doc, options) : null;
  return edited?.length ? edited : seed;
}

/**
 * FaqAccordion — grouped questions built on native `<details>`, so it is
 * keyboard-accessible, findable with in-page search and works with no JS.
 *
 * `surface` is the FAQ collection's own filter: pass it and the accordion shows
 * whatever groups are published for that page, including ones added here.
 */
export function FaqAccordion({
  groups,
  surface,
}: {
  groups: FaqGroup[];
  surface?: "help" | "partner" | "rider";
}) {
  const resolved = useCmsFaqGroups(surface ?? "help", groups);
  const list = surface ? resolved : groups;

  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-10">
      {list.map((group) => (
        <section key={group.id} id={group.id} className="scroll-mt-24">
          <h3 className="flex items-center gap-2.5 text-h3 text-ink">
            <span className="inline-flex size-9 items-center justify-center rounded-pill bg-primary/10 text-primary">
              <DashIcon name={group.icon} className="size-4.5" />
            </span>
            {group.title}
          </h3>

          <div className="mt-4 divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
            {group.items.map((item) => (
              <details key={item.question} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2">
                  {item.question}
                  <ChevronDown
                    className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <p className="px-5 pb-5 text-body">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
