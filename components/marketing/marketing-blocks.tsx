import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { FaqGroup, HowStep, StatItem, ValueProp } from "@/types";
import { DashIcon } from "@/components/directory/dash-icon";
import { cn } from "@/lib/utils";

/**
 * marketing-blocks.tsx — the reusable bands the marketing and legal pages are
 * assembled from (spec: Reusable Components). Every one is a server component
 * that takes resolved content, so the pages stay thin and none of them holds
 * copy or layout of its own.
 */

/** PageHero — the shared heading band for a marketing page. */
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-line bg-surface-muted">
      <div className="container-site py-12 md:py-16">
        {eyebrow && (
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
        )}
        <h1 className="text-display mt-2 max-w-3xl text-ink">{title}</h1>
        {lead && <p className="mt-4 max-w-2xl text-lg text-body">{lead}</p>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

/** StatsBand — a row of headline metrics. */
export function StatsBand({ stats }: { stats: StatItem[] }) {
  if (stats.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-6 rounded-panel border border-line bg-surface p-6 sm:grid-cols-4 md:p-8">
      {stats.map((s) => (
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
}: {
  items: ValueProp[];
  columns?: 2 | 3;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      className={cn(
        "grid gap-6",
        columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {items.map((item) => (
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

/** HowItWorks — numbered steps with connecting rhythm. */
export function HowSteps({ steps }: { steps: HowStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, i) => (
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

/**
 * FaqAccordion — grouped questions built on native `<details>`, so it is
 * keyboard-accessible, findable with in-page search and works with no JS.
 */
export function FaqAccordion({ groups }: { groups: FaqGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-10">
      {groups.map((group) => (
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
