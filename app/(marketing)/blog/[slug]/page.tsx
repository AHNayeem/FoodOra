import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft, Clock } from "lucide-react";
import { getBlogPost, getBlogPostSlugs, getRelatedPosts } from "@/services/content";
import { PostBody } from "@/components/blog/post-body";
import { PostCard } from "@/components/blog/post-card";
import { SectionHeading } from "@/components/sections/section-heading";

type Params = Promise<{ slug: string }>;

/** Prerender every article at build time (spec: SEO, fast pages). */
export function generateStaticParams() {
  return getBlogPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      images: [{ url: post.cover, alt: post.title }],
      publishedTime: post.publishedAt,
      authors: [post.author],
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [post.cover],
    },
  };
}

/**
 * Article reader (spec: Food Blog / CMS Blogs). The body is structured content
 * from the seam, rendered by {@link PostBody} — no HTML injection — followed by
 * a related-posts rail matched on shared tags.
 */
export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [post, t, format] = await Promise.all([
    getBlogPost(slug),
    getTranslations("blog"),
    getFormatter(),
  ]);
  if (!post) notFound();

  const related = await getRelatedPosts(slug, 3);

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
            {post.category}
          </p>
          <h1 className="text-display mt-2 max-w-3xl text-ink">{post.title}</h1>
          <p className="mt-3 max-w-2xl text-lg text-body">{post.excerpt}</p>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <span className="relative size-11 shrink-0 overflow-hidden rounded-pill bg-surface">
              <Image src={post.authorAvatar} alt="" fill sizes="44px" className="object-cover" />
            </span>
            <span className="text-sm">
              <span className="block font-semibold text-ink">{post.author}</span>
              <span className="block text-muted">{post.authorRole}</span>
            </span>
            <span className="flex items-center gap-x-3 text-sm text-muted">
              <time dateTime={post.publishedAt}>
                {format.dateTime(new Date(post.publishedAt), {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-4" aria-hidden />
                {t("readMinutes", { count: post.readMinutes })}
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* Cover */}
      <div className="container-site -mt-0 py-8">
        <div className="relative aspect-[16/9] overflow-hidden rounded-card bg-surface-muted md:aspect-[21/9]">
          <Image
            src={post.cover}
            alt={post.title}
            fill
            sizes="(min-width: 1280px) 1200px, 100vw"
            priority
            className="object-cover"
          />
        </div>
      </div>

      {/* Body */}
      <div className="container-site">
        <div className="mx-auto max-w-3xl">
          <PostBody blocks={post.body} />

          <ul className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
            {post.tags.map((tag) => (
              <li key={tag}>
                <span className="inline-flex rounded-pill bg-surface-muted px-3 py-1 text-xs font-semibold text-body">
                  {tag}
                </span>
              </li>
            ))}
          </ul>
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
