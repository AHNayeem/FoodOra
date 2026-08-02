"use client";

import Image from "next/image";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Clock } from "lucide-react";
import type { BlogPost } from "@/frontend/types";
import { useCmsPost } from "@/frontend/components/cms/use-cms-content";
import { PostBody } from "@/frontend/components/blog/post-body";
import { PostCard } from "@/frontend/components/blog/post-card";
import { SectionHeading } from "@/frontend/components/sections/section-heading";

/**
 * ArticleView — the reader for one article (spec: Food Blog / CMS Blogs).
 *
 * The body is structured content from the seam, rendered by {@link PostBody} —
 * no HTML injection — followed by a related-posts rail matched on shared tags.
 * Since C26 the post is a CMS document, so a title, an excerpt, a cover or a
 * whole block edited in `/admin/cms` shows up here; the server still renders the
 * published version, which is what the crawler and the `generateMetadata` above
 * this component see.
 */
export function ArticleView({ post, related }: { post: BlogPost; related: BlogPost[] }) {
  const t = useTranslations("blog");
  const format = useFormatter();
  const article = useCmsPost(post);

  return (
    <article className="pb-16">
      {/* Header */}
      <header className="border-b border-line bg-surface-muted">
        <div className="container-site py-8 md:py-12">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("backToBlog")}
          </Link>

          <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-primary">
            {article.category}
          </p>
          <h1 className="text-display mt-2 max-w-3xl text-ink">{article.title}</h1>
          <p className="mt-3 max-w-2xl text-lg text-body">{article.excerpt}</p>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            {article.authorAvatar && (
              <span className="relative size-11 shrink-0 overflow-hidden rounded-pill bg-surface">
                <Image src={article.authorAvatar} alt="" fill sizes="44px" className="object-cover" />
              </span>
            )}
            <span className="text-sm">
              <span className="block font-semibold text-ink">{article.author}</span>
              <span className="block text-muted">{article.authorRole}</span>
            </span>
            <span className="flex items-center gap-x-3 text-sm text-muted">
              <time dateTime={article.publishedAt}>
                {format.dateTime(new Date(article.publishedAt), {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-4" aria-hidden />
                {t("readMinutes", { count: article.readMinutes })}
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* Cover */}
      {article.cover && (
        <div className="container-site py-8">
          <div className="relative aspect-[16/9] overflow-hidden rounded-card bg-surface-muted md:aspect-[21/9]">
            <Image
              src={article.cover}
              alt={article.title}
              fill
              sizes="(min-width: 1280px) 1200px, 100vw"
              priority
              className="object-cover"
            />
          </div>
        </div>
      )}

      {/* Body */}
      <div className="container-site">
        <div className="mx-auto max-w-3xl">
          <PostBody blocks={article.body} />

          {article.tags.length > 0 && (
            <ul className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
              {article.tags.map((tag) => (
                <li key={tag}>
                  <span className="inline-flex rounded-pill bg-surface-muted px-3 py-1 text-xs font-semibold text-body">
                    {tag}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="container-site pt-14">
          <SectionHeading title={t("relatedTitle")} subtitle={t("relatedSubtitle")} />
          <div className="grid gap-6 md:grid-cols-3">
            {related.map((item) => (
              <PostCard key={item.id} post={item} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
