"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import type { BlogPost } from "@/frontend/types";
import { useCmsPosts } from "@/frontend/components/cms/use-cms-content";
import { PostCard } from "@/frontend/components/blog/post-card";

/**
 * PostList — the blog index's filter chips, featured card and grid.
 *
 * The active category stays in the URL so a filtered view is shareable (the page
 * reads it and passes it in), while the chips are derived from the posts that are
 * actually published — including an article added on this device, which brings its
 * category with it.
 */
export function PostList({ posts, activeCategory }: { posts: BlogPost[]; activeCategory: string }) {
  const t = useTranslations("blog");
  const published = useCmsPosts(posts);

  const counts = new Map<string, number>();
  for (const post of published) counts.set(post.category, (counts.get(post.category) ?? 0) + 1);
  const categories = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const category = categories.some((c) => c.name === activeCategory) ? activeCategory : "";
  const visible = category ? published.filter((p) => p.category === category) : published;

  // Only lead with a featured card on the unfiltered view — inside a category a
  // uniform grid reads better than an arbitrary hero.
  const showLead = !category && visible.length > 0;
  const lead = showLead ? visible[0] : null;
  const rest = showLead ? visible.slice(1) : visible;

  return (
    <>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        <Chip href="/blog" active={category === ""}>
          {t("allCategories")}
        </Chip>
        {categories.map((c) => (
          <Chip
            key={c.name}
            href={`/blog?category=${encodeURIComponent(c.name)}`}
            active={category === c.name}
            count={c.count}
          >
            {c.name}
          </Chip>
        ))}
      </div>

      <p className="mt-6 text-sm font-medium text-muted" aria-live="polite">
        {t("postCount", { count: visible.length })}
      </p>

      {visible.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-panel border border-dashed border-line py-16 text-center">
          <FileText className="size-10 text-muted" aria-hidden />
          <p className="text-lg font-semibold text-ink">{t("emptyTitle")}</p>
          <p className="text-body">{t("emptyBody")}</p>
        </div>
      ) : (
        <>
          {lead && (
            <div className="mt-4">
              <PostCard post={lead} featured />
            </div>
          )}
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Chip({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-pill border border-primary bg-primary px-4 text-sm font-semibold text-white"
          : "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-pill border border-line bg-surface px-4 text-sm font-semibold text-body hover:border-primary hover:text-primary"
      }
    >
      {children}
      {count !== undefined && (
        <span className={active ? "text-white/70" : "text-muted"}>{count}</span>
      )}
    </Link>
  );
}
