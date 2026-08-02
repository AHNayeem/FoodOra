import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getBlogPosts } from "@/services/content";
import { getRouteMetadata, readOptions } from "@/services/cms";
import { PostList } from "@/components/blog/post-list";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return getRouteMetadata("/blog", readOptions(locale, (key) => t(key)), {
    title: t("blog.metaTitle"),
    description: t("blog.metaDescription"),
  });
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Blog index (spec: CMS — Blogs; Food Blog). Articles are CMS documents; the
 * category filter lives in the URL so a filtered view is shareable, and the
 * chips are derived from what is published rather than from a fixed list.
 */
export default async function BlogPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const [t, locale] = await Promise.all([getTranslations("blog"), getLocale()]);
  const root = await getTranslations();

  const posts = await getBlogPosts(undefined, { locale, translate: (key) => root(key) });
  const activeCategory = typeof raw.category === "string" ? raw.category : "";

  return (
    <div className="pb-16">
      <section className="border-b border-line bg-surface-muted">
        <div className="container-site py-12 md:py-16">
          <h1 className="text-display max-w-2xl text-ink">{t("title")}</h1>
          <p className="mt-3 max-w-xl text-lg text-body">{t("subtitle")}</p>
        </div>
      </section>

      <div className="container-site py-8 md:py-12">
        <PostList posts={posts} activeCategory={activeCategory} />
      </div>
    </div>
  );
}
