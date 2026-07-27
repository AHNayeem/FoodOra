import Image from "next/image";
import Link from "next/link";
import type { Category } from "@/types";

/**
 * CategoryRail — horizontally scrollable "What are you craving?" rail.
 * Scrolls on mobile, wraps to a grid on larger screens.
 */
export function CategoryRail({ categories }: { categories: Category[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0 lg:grid-cols-10">
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/search?category=${c.slug}`}
          className="group flex w-20 shrink-0 flex-col items-center gap-2 md:w-auto"
        >
          <span className="relative size-20 overflow-hidden rounded-pill bg-surface-muted ring-1 ring-line transition-transform duration-[var(--duration-base)] group-hover:-translate-y-1 group-hover:ring-primary">
            <Image
              src={c.image}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
            />
          </span>
          <span className="text-center text-sm font-medium text-ink">
            {c.emoji} {c.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
