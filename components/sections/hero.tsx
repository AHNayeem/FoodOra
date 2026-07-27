"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Hero — the landing headline + address search. Submitting routes to the
 * search page (the query is mock-handled there in a later phase).
 */
export function Hero() {
  const t = useTranslations("home");
  const router = useRouter();
  const [address, setAddress] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = address.trim();
    router.push(q ? `/search?near=${encodeURIComponent(q)}` : "/search");
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
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-display text-ink"
          >
            {t("heroTitle")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 max-w-xl text-lg text-body"
          >
            {t("heroSubtitle")}
          </motion.p>

          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={onSubmit}
            className="mt-8 flex flex-col gap-2 rounded-pill bg-surface p-2 shadow-card sm:flex-row sm:items-center"
          >
            <div className="flex flex-1 items-center gap-2 ps-4">
              <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="h-11 w-full bg-transparent text-ink outline-none placeholder:text-muted"
              />
            </div>
            <Button type="submit" size="lg" className="sm:w-auto">
              <Search className="size-5" aria-hidden />
              {t("findFood")}
            </Button>
          </motion.form>
        </div>
      </div>
    </section>
  );
}
