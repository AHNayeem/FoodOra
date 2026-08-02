"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { MapPin, Search } from "lucide-react";
import type { CmsBanner } from "@/frontend/types";
import { useCmsBanners } from "@/frontend/components/cms/use-cms-content";
import { Button } from "@/frontend/components/ui/button";

/**
 * Hero — the landing headline + address search. Submitting routes to the
 * search page.
 *
 * Since C26 the copy is the `home-hero` banner document (spec: CMS — Hero
 * Banner). Its seeded fields hold *message keys* rather than text, so all three
 * locales read exactly as they did before the CMS existed, and an edit made in
 * `/admin/cms` replaces only the locale it was written in.
 */
export function Hero({ banner }: { banner: CmsBanner | null }) {
  const t = useTranslations("home");
  const router = useRouter();
  const [address, setAddress] = useState("");

  const banners = useCmsBanners("home-hero", banner ? [banner] : []);
  const hero = banners[0] ?? banner;

  const title = hero?.title || t("heroTitle");
  const subtitle = hero?.subtitle || t("heroSubtitle");
  const placeholder = hero?.searchPlaceholder || t("searchPlaceholder");
  const cta = hero?.ctaLabel || t("findFood");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = address.trim();
    const base = hero?.ctaHref || "/search";
    router.push(q ? `${base}?near=${encodeURIComponent(q)}` : base);
  }

  return (
    <section className="relative overflow-hidden bg-surface-muted">
      {/* Warm radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 end-[-10%] size-[38rem] rounded-full bg-primary/10 blur-3xl"
      />
      <div className="container-site relative py-16 md:py-24 lg:py-28">
        <div className="max-w-2xl">
          {hero?.eyebrow && (
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary"
            >
              {hero.eyebrow}
            </motion.p>
          )}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-display text-ink"
          >
            {title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 max-w-xl text-lg text-body"
          >
            {subtitle}
          </motion.p>

          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={onSubmit}
            className="mt-8 flex w-full flex-col gap-2.5 rounded-panel bg-surface p-2.5 shadow-card outline-primary outline-offset-2 has-[input:focus-visible]:outline-2 sm:flex-row sm:items-center sm:gap-2 sm:rounded-pill sm:p-2"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-pill bg-surface-muted px-4 sm:bg-transparent sm:px-0 sm:ps-4">
              <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={placeholder}
                aria-label={placeholder}
                className="h-12 w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:truncate placeholder:text-muted sm:h-11"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-12 w-full px-6 sm:h-13 sm:w-auto sm:px-7"
            >
              <Search className="size-5 shrink-0" aria-hidden />
              {cta}
            </Button>
          </motion.form>
        </div>
      </div>
    </section>
  );
}
