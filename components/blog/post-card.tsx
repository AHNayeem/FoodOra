import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, Clock } from "lucide-react";
import type { BlogPost } from "@/types";
import { cn } from "@/lib/utils";

/**
 * PostCard — a blog teaser. `featured` renders the wide, side-by-side variant
 * used for the lead article on the index; the default is the grid card reused by
 * the landing teaser row and the related-posts rail.
 */
export async function PostCard({
  post,
  featured = false,
}: {
  post: BlogPost;
  featured?: boolean;
}) {
  const t = await getTranslations("blog");
  const format = await getFormatter();

  return (
    <article
      className={cn(
        "group flex overflow-hidden rounded-card bg-surface shadow-card transition-transform hover:-translate-y-1",
        featured ? "flex-col md:flex-row" : "flex-col",
      )}
    >
      <Link
        href={`/blog/${post.slug}`}
        className={cn(
          "flex focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
          featured ? "flex-col md:flex-row" : "flex-1 flex-col",
        )}
      >
        <span
          className={cn(
            "relative block overflow-hidden",
            featured ? "aspect-[16/10] md:w-1/2 md:shrink-0" : "aspect-[16/10]",
          )}
        >
          <Image
            src={post.cover}
            alt=""
            fill
            sizes={featured ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 33vw, 100vw"}
            className="object-cover transition-transform duration-[var(--duration-base)] group-hover:scale-105"
          />
          <span className="absolute start-3 top-3 rounded-pill bg-surface/90 px-2.5 py-1 text-xs font-semibold text-ink backdrop-blur">
            {post.category}
          </span>
        </span>

        <div className={cn("flex flex-1 flex-col p-5", featured && "md:p-7")}>
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

          <h3
            className={cn(
              "mt-2 font-bold text-ink group-hover:text-primary",
              featured ? "text-h2" : "text-lg",
            )}
          >
            {post.title}
          </h3>
          <p className={cn("mt-2 flex-1 text-body", featured ? "text-base" : "text-sm")}>
            {post.excerpt}
          </p>

          <div className="mt-4 flex items-center gap-2.5">
            <span className="relative size-8 shrink-0 overflow-hidden rounded-pill bg-surface-muted">
              <Image src={post.authorAvatar} alt="" fill sizes="32px" className="object-cover" />
            </span>
            <span className="min-w-0 text-xs">
              <span className="block truncate font-semibold text-ink">{post.author}</span>
              <span className="block truncate text-muted">{post.authorRole}</span>
            </span>
            <span className="ms-auto inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
              {t("readMore")}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
