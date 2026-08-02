"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Menu, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LocaleSwitcher } from "@/components/ui/locale-switcher";
import { AccountMenu } from "@/components/layout/account-menu";
import { PrimaryNav } from "@/components/layout/primary-nav";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { CartButton } from "@/components/cart/cart-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import type { CmsMenuItem } from "@/types";
import { useAuth } from "@/stores/auth";
import { useFavorites } from "@/stores/favorites";
import { cn } from "@/lib/utils";

/**
 * SiteHeader — sticky marketing header.
 *
 * Three zones on one 64/72px line: brand (fixed), navigation (elastic, see
 * PrimaryNav's priority-plus overflow) and actions (fixed). Below `lg` the
 * navigation collapses into MobileNavDrawer and the bar keeps only what a
 * thumb needs: brand, notifications, cart, menu.
 *
 * The links arrive as content (the CMS `header` menu, C26) from the layout, so
 * the desktop bar and the drawer are drawn from one list and cannot disagree
 * about which routes exist.
 */
export function SiteHeader({ menu }: { menu: CmsMenuItem[] }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
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

  // Flat while at the top of the page, lifted once content slides underneath.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeDrawer = useCallback(() => setOpen(false), []);
  const signedIn = hydrated && !!user;

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-[var(--duration-base)]",
          scrolled
            ? "border-line bg-surface/85 shadow-card backdrop-blur-md"
            : "border-transparent bg-surface",
        )}
      >
        <div className="container-site flex h-16 items-center gap-2 lg:h-18 lg:gap-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 font-extrabold text-ink transition-opacity hover:opacity-90"
          >
            <span className="inline-flex size-9 items-center justify-center rounded-pill bg-primary text-white shadow-sm">
              <UtensilsCrossed className="size-5" aria-hidden />
            </span>
            <span className="text-lg tracking-tight">{t("common.appName")}</span>
          </Link>

          <PrimaryNav menu={menu} className="hidden flex-1 lg:flex" />

          <div className="ms-auto flex shrink-0 items-center gap-1">
            <div className="hidden items-center gap-1 lg:flex">
              <LocaleSwitcher />
              <ThemeToggle />
              <span className="mx-1 h-6 w-px bg-line" aria-hidden />
            </div>

            {/* Order updates the customer would otherwise only see on the tracker. */}
            {signedIn && <NotificationBell audience="customer" />}
            <CartButton />

            {signedIn && user ? (
              <div className="ms-1 hidden lg:block">
                <AccountMenu user={user} />
              </div>
            ) : (
              <>
                <Button href="/login" variant="ghost" size="sm" className="hidden lg:inline-flex">
                  {t("common.signIn")}
                </Button>
                <Button href="/register" size="sm" className="ms-1 hidden lg:inline-flex">
                  {t("common.getStarted")}
                </Button>
              </>
            )}

            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={t("common.menu")}
              aria-expanded={open}
              aria-haspopup="dialog"
              className="inline-flex size-11 items-center justify-center rounded-pill text-ink transition-colors hover:bg-surface-muted lg:hidden"
            >
              <Menu className="size-5.5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <MobileNavDrawer
        open={open}
        onClose={closeDrawer}
        user={signedIn ? user : null}
        menu={menu}
      />
    </>
  );
}
