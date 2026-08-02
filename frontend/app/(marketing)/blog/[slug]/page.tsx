import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getBlogPost, getBlogPostSlugs, getRelatedPosts } from "@/frontend/services/content";
import { ArticleView } from "@/frontend/components/blog/article-view";

type Params = Promise<{ slug: string }>;

/** Prerender every article at build time (spec: SEO, fast pages). */
export function generateStaticParams() {
  return getBlogPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const post = await getBlogPost(slug, { locale, translate: (key) => t(key) });
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
 * Article reader (spec: Food Blog / CMS Blogs). The post is a CMS document since
 * C26; this route resolves the published one and {@link ArticleView} renders it.
 */
export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const options = { locale, translate: (key: string) => t(key) };

  const post = await getBlogPost(slug, options);
  if (!post) notFound();

  const related = await getRelatedPosts(slug, 3, options);

  return <ArticleView post={post} related={related} />;
}
