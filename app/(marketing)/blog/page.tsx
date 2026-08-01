import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { getBlogCategories, getBlogPosts } from "@/services/content";
import { PostCard } from "@/components/blog/post-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("blog");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/blog" },
  };
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Blog index (spec: CMS — Blogs; Food Blog). The category filter lives in the
 * URL so a filtered view is shareable, and the newest post leads as a wide
 * featured card. Content is served through the content seam, ready for a CMS.
 */
export default async function BlogPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const t = await getTranslations("blog");

  const [allPosts, categories] = await Promise.all([getBlogPosts(), getBlogCategories()]);

  const requested = typeof raw.category === "string" ? raw.category : "";
  const activeCategory = categories.some((c) => c.name === requested) ? requested : "";
  const posts = activeCategory
    ? allPosts.filter((p) => p.category === activeCategory)
    : allPosts;

  // Only lead with a featured card on the unfiltered view — inside a category a
  // uniform grid reads better than an arbitrary hero.
  const showLead = !activeCategory && posts.length > 0;
  const lead = showLead ? posts[0] : null;
  const rest = showLead ? posts.slice(1) : posts;

  return (
    <div className="pb-16">
      <section className="border-b border-line bg-surface-muted">
        <div className="container-site py-12 md:py-16">
          <h1 className="text-display max-w-2xl text-ink">{t("title")}</h1>
          <p className="mt-3 max-w-xl text-lg text-body">{t("subtitle")}</p>
        </div>
      </section>

      <div className="container-site py-8 md:py-12">
        {/* Category filter */}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          <Link
            href="/blog"
            aria-current={activeCategory === "" ? "page" : undefined}
            className={
              activeCategory === ""
                ? "inline-flex h-10 shrink-0 items-center rounded-pill border border-primary bg-primary px-4 text-sm font-semibold text-white"
                : "inline-flex h-10 shrink-0 items-center rounded-pill border border-line bg-surface px-4 text-sm font-semibold text-body hover:border-primary hover:text-primary"
            }
          >
            {t("allCategories")}
          </Link>
          {categories.map((c) => {
            const active = activeCategory === c.name;
            return (
              <Link
                key={c.name}
                href={`/blog?category=${encodeURIComponent(c.name)}`}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-pill border border-primary bg-primary px-4 text-sm font-semibold text-white"
                    : "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-pill border border-line bg-surface px-4 text-sm font-semibold text-body hover:border-primary hover:text-primary"
                }
              >
                {c.name}
                <span className={active ? "text-white/70" : "text-muted"}>{c.count}</span>
              </Link>
            );
          })}
        </div>

        <p className="mt-6 text-sm font-medium text-muted" aria-live="polite">
          {t("postCount", { count: posts.length })}
        </p>

        {posts.length === 0 ? (
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
      </div>
    </div>
  );
}
