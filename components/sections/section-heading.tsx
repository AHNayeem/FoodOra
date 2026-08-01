import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** SectionHeading — title + optional subtitle and "see all" link for home rows. */
export function SectionHeading({
  title,
  subtitle,
  seeAllHref,
  seeAllLabel,
}: {
  /** Usually a translated string; accepts nodes so a heading can carry an icon. */
  title: ReactNode;
  subtitle?: string;
  seeAllHref?: string;
  seeAllLabel?: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-h2 text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-body">{subtitle}</p>}
      </div>
      {seeAllHref && (
        <Link
          href={seeAllHref}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:gap-2 transition-[gap]"
        >
          {seeAllLabel ?? "See all"}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      )}
    </div>
  );
}
