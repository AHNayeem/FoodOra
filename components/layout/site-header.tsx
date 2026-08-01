"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Menu, X, UtensilsCrossed } from "lucide-react";
import { primaryNav } from "@/constants/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LocaleSwitcher } from "@/components/ui/locale-switcher";
import { AccountMenu } from "@/components/layout/account-menu";
import { CartButton } from "@/components/cart/cart-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useAuth } from "@/stores/auth";
import { useFavorites } from "@/stores/favorites";
import { cn } from "@/lib/utils";

/** SiteHeader — sticky marketing header with responsive nav + mobile drawer. */
export function SiteHeader() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);

  // The session store skips auto-rehydration so SSR and the first client render
  // both start logged-out (no mismatch); we rehydrate from localStorage here.
  // Favorites rehydrate here too, once per page, so the heart on every card can
  // just read `hydrated` instead of each one re-reading localStorage (C23).
  useEffect(() => {
    useAuth.persist.rehydrate();
    useFavorites.persist.rehydrate();
  }, []);
  const signedIn = hydrated && !!user;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="container-site flex h-16 items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-extrabold text-ink">
          <span className="inline-flex size-9 items-center justify-center rounded-pill bg-primary text-white">
            <UtensilsCrossed className="size-5" aria-hidden />
          </span>
          <span className="text-lg tracking-tight">{t("common.appName")}</span>
        </Link>

        <nav className="mx-2 hidden items-center gap-1 lg:flex">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-pill px-3 py-2 text-sm font-medium text-body transition-colors hover:bg-surface-muted hover:text-ink"
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-1">
          <LocaleSwitcher className="hidden sm:inline-flex" />
          <ThemeToggle />
          {/* Order updates the customer would otherwise only see on the tracker. */}
          {user && <NotificationBell audience="customer" />}
          <CartButton />
          {signedIn && user ? (
            <AccountMenu user={user} />
          ) : (
            <>
              <Button href="/login" variant="ghost" size="sm" className="hidden md:inline-flex">
                {t("common.signIn")}
              </Button>
              <Button href="/register" size="sm" className="hidden md:inline-flex">
                {t("common.getStarted")}
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="inline-flex size-10 items-center justify-center rounded-pill text-ink hover:bg-surface-muted lg:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          "overflow-hidden border-t border-line bg-surface transition-[max-height] duration-[var(--duration-base)] lg:hidden",
          open ? "max-h-96" : "max-h-0 border-t-0",
        )}
      >
        <nav className="container-site flex flex-col gap-1 py-3">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-field px-3 py-2.5 text-sm font-medium text-body hover:bg-surface-muted hover:text-ink"
            >
              {t(item.labelKey)}
            </Link>
          ))}
          {!signedIn && (
            <div className="mt-2 flex items-center gap-2 px-1">
              <Button href="/login" variant="outline" size="sm" className="flex-1">
                {t("common.signIn")}
              </Button>
              <Button href="/register" size="sm" className="flex-1">
                {t("common.getStarted")}
              </Button>
            </div>
          )}
          <div className="px-1 pt-1">
            <LocaleSwitcher />
          </div>
        </nav>
      </div>
    </header>
  );
}
