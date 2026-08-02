import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, Clock } from "lucide-react";
import { SectionHeading } from "./section-heading";
import type { BlogPost } from "@/frontend/types";

/**
 * BlogTeaser — "from the blog" row (server component). Cards link to
 * `/blog/[slug]` (the blog reader is a later CMS phase; stubbed for now).
 */
export async function BlogTeaser({ posts }: { posts: BlogPost[] }) {
  const t = await getTranslations("home");
  const format = await getFormatter();
  if (posts.length === 0) return null;

  return (
    <section className="container-site py-16">
      <SectionHeading
        title={t("blogTitle")}
        subtitle={t("blogSubtitle")}
        seeAllHref="/blog"
        seeAllLabel={t("blogSeeAll")}
      />

      <div className="grid gap-6 md:grid-cols-3">
        {posts.map((post) => (
          <article
            key={post.id}
            className="group flex flex-col overflow-hidden rounded-card bg-surface shadow-card transition-transform hover:-translate-y-1"
          >
            <Link
              href={`/blog/${post.slug}`}
              className="flex flex-1 flex-col focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            >
              <span className="relative block aspect-[16/10] overflow-hidden">
                <Image
                  src={post.cover}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="object-cover transition-transform duration-[var(--duration-base)] group-hover:scale-105"
                />
                <span className="absolute start-3 top-3 rounded-pill bg-surface/90 px-2.5 py-1 text-xs font-semibold text-ink backdrop-blur">
                  {post.category}
                </span>
              </span>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <time dateTime={post.publishedAt}>
                    {format.dateTime(new Date(post.publishedAt), {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden />
                    {t("readMinutes", { count: post.readMinutes })}
                  </span>
                </div>

                <h3 className="mt-2 text-lg font-bold text-ink group-hover:text-primary">
                  {post.title}
                </h3>
                <p className="mt-2 flex-1 text-sm text-body">{post.excerpt}</p>

                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  {t("readMore")}
                  <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
                </span>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
