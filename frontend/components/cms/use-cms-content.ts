"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type {
  BlogPost,
  Category,
  CmsBanner,
  CmsBannerPlacement,
  CmsContactContent,
  CmsDocument,
  CmsMenuItem,
  CmsSite,
  FaqGroup,
  LegalDoc,
  SupportChannel,
} from "@/types";
import {
  isLive,
  toBanner,
  toBlogPost,
  toCategory,
  toContactContent,
  toFaqGroup,
  toLegalDoc,
  toMenuItems,
  toSite,
  toSupportChannels,
  faqSurfaceOf,
  type CmsReadOptions,
} from "@/lib/cms";
import { allDocuments } from "@/services/cms";
import { hasLocalEdits, useCms, useCmsContext } from "@/stores/cms";

/**
 * use-cms-content — how an edit made in `/admin/cms` reaches the public site.
 *
 * There is no server, so a published change lives in `stores/cms` on the device
 * that made it. Every hook here has the same shape: **seed in, effective content
 * out.** The server already rendered the seed (which is itself a projection of
 * the same documents), so before hydration and on a device that has edited
 * nothing, the hook returns exactly what the server sent — no flash, no mismatch
 * — and afterwards it returns the same content with this device's edits applied.
 *
 * That is also the phase's honest limit, stated on the admin overview: a
 * publication is real, reversible and audited, but it is real *here*. Another
 * browser sees the seed until Phase E gives these documents a database.
 */
function useCmsDocuments(): { docs: CmsDocument[] | null; options: CmsReadOptions } {
  const t = useTranslations();
  const locale = useLocale();
  const ctx = useCmsContext();
  const hydrated = useCms((s) => s.hydrated);

  // One clock per mount: a scheduled banner appearing mid-session is not worth a
  // re-render, and re-reading `Date.now()` every render would make the memo useless.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    void useCms.persist.rehydrate();
  }, []);

  const options = useMemo<CmsReadOptions>(
    () => ({ locale: locale as CmsReadOptions["locale"], translate: (key: string) => t(key) }),
    // `t` is stable per catalog; the locale is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );

  const docs = useMemo(() => {
    if (!hydrated || !hasLocalEdits(ctx)) return null; // seed is already correct
    return allDocuments(ctx, now).filter((doc) => isLive(doc, now));
  }, [ctx, hydrated, now]);

  return { docs, options };
}

function pick(docs: CmsDocument[] | null, collection: CmsDocument["collection"], key: string) {
  return docs?.find((doc) => doc.collection === collection && doc.key === key) ?? null;
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function useCmsBanners(placement: CmsBannerPlacement, seed: CmsBanner[]): CmsBanner[] {
  const { docs, options } = useCmsDocuments();
  return useMemo(() => {
    if (!docs) return seed;
    return docs
      .filter((doc) => doc.collection === "banners")
      .map((doc) => toBanner(doc, options))
      .filter((banner) => banner.placement === placement);
  }, [docs, options, placement, seed]);
}

export function useCmsMenu(key: "header" | "footer", seed: CmsMenuItem[]): CmsMenuItem[] {
  const { docs, options } = useCmsDocuments();
  return useMemo(() => {
    const doc = pick(docs, "menus", key);
    return doc ? toMenuItems(doc, options) : seed;
  }, [docs, options, key, seed]);
}

export function useCmsCategories(seed: Category[]): Category[] {
  const { docs, options } = useCmsDocuments();
  return useMemo(() => {
    if (!docs) return seed;
    return docs.filter((doc) => doc.collection === "categories").map((doc) => toCategory(doc, options));
  }, [docs, options, seed]);
}

export function useCmsLegalDoc(seed: LegalDoc): LegalDoc {
  const { docs, options } = useCmsDocuments();
  return useMemo(() => {
    const doc = pick(docs, "legal", seed.slug);
    return doc ? toLegalDoc(doc, options) : seed;
  }, [docs, options, seed]);
}

export function useCmsFaqGroups(surface: "help" | "partner" | "rider", seed: FaqGroup[]): FaqGroup[] {
  const { docs, options } = useCmsDocuments();
  return useMemo(() => {
    if (!docs) return seed;
    return docs
      .filter((doc) => doc.collection === "faqs" && faqSurfaceOf(doc) === surface)
      .map((doc) => toFaqGroup(doc, options));
  }, [docs, options, surface, seed]);
}

export function useCmsSupportChannels(seed: SupportChannel[]): SupportChannel[] {
  const { docs, options } = useCmsDocuments();
  return useMemo(() => {
    const doc = pick(docs, "pages", "help");
    return doc ? toSupportChannels(doc, options) : seed;
  }, [docs, options, seed]);
}

export function useCmsContact(seed: CmsContactContent): CmsContactContent {
  const { docs, options } = useCmsDocuments();
  return useMemo(() => {
    const doc = pick(docs, "pages", "contact");
    return doc ? toContactContent(doc, options) : seed;
  }, [docs, options, seed]);
}

export function useCmsSite(seed: CmsSite): CmsSite {
  const { docs, options } = useCmsDocuments();
  return useMemo(() => {
    const doc = pick(docs, "site", "site");
    return doc ? toSite(doc, options) : seed;
  }, [docs, options, seed]);
}

export function useCmsPosts(seed: BlogPost[]): BlogPost[] {
  const { docs, options } = useCmsDocuments();
  return useMemo(() => {
    if (!docs) return seed;
    return docs
      .filter((doc) => doc.collection === "posts")
      .map((doc) => toBlogPost(doc, options))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }, [docs, options, seed]);
}

export function useCmsPost(seed: BlogPost): BlogPost {
  const { docs, options } = useCmsDocuments();
  return useMemo(() => {
    const doc = docs?.find((d) => d.collection === "posts" && toBlogPost(d, options).slug === seed.slug);
    return doc ? toBlogPost(doc, options) : seed;
  }, [docs, options, seed]);
}

/**
 * The document behind a marketing page, for the bodies that project it
 * themselves (about, careers, the two pitch pages). `null` means "render the
 * seed you were given".
 */
export function useCmsPageDoc(key: string): { doc: CmsDocument | null; options: CmsReadOptions } {
  const { docs, options } = useCmsDocuments();
  return useMemo(() => ({ doc: pick(docs, "pages", key), options }), [docs, options, key]);
}
