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
            className="mt-8 flex w-full flex-col gap-2.5 rounded-panel bg-surface p-2.5 shadow-card outline-primary outline-offset-2 has-[input:focus-visible]:outline-2 sm:flex-row sm:items-center sm:gap-2 sm:rounded-pill sm:p-2"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-pill bg-surface-muted px-4 sm:bg-transparent sm:px-0 sm:ps-4">
              <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="h-12 w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:truncate placeholder:text-muted sm:h-11"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-12 w-full px-6 sm:h-13 sm:w-auto sm:px-7"
            >
              <Search className="size-5 shrink-0" aria-hidden />
              {t("findFood")}
            </Button>
          </motion.form>
        </div>
      </div>
    </section>
  );
}
