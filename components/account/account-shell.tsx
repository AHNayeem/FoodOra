"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  User as UserIcon,
  ShoppingBag,
  CalendarClock,
  CalendarCheck,
  MapPin,
  Wallet,
  Ticket,
  Heart,
  Star,
  Settings,
  Lock,
} from "lucide-react";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/account", key: "profile", icon: UserIcon },
  { href: "/account/orders", key: "orders", icon: ShoppingBag },
  { href: "/account/subscriptions", key: "subscriptions", icon: CalendarClock },
  { href: "/account/reservations", key: "reservations", icon: CalendarCheck },
  { href: "/account/favorites", key: "favorites", icon: Heart },
  { href: "/account/reviews", key: "reviews", icon: Star },
  { href: "/account/addresses", key: "addresses", icon: MapPin },
  { href: "/account/wallet", key: "wallet", icon: Wallet },
  { href: "/account/coupons", key: "coupons", icon: Ticket },
  { href: "/account/settings", key: "settings", icon: Settings },
] as const;

/**
 * AccountShell — the shared frame for every `/account/*` page (Phase C3). It
 * centralises the auth gate: the whole section is private, so it rehydrates the
 * session, shows a spinner until then, prompts sign-in when logged out, and
 * only renders the page (`children`) plus the section sidebar for a signed-in
 * customer. There is no server session in the prototype, so the gate is
 * client-side (a real app would also guard in middleware).
 */
export function AccountShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("account");
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);

  useEffect(() => {
    useAuth.persist.rehydrate();
  }, []);

  if (!hydrated) {
    return (
      <div className="container-site flex min-h-[50vh] items-center justify-center py-16">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container-site flex min-h-[50vh] flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <Lock className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">{t("gateTitle")}</h1>
        <p className="max-w-sm text-body">{t("gateBody")}</p>
        <Button href="/login" className="mt-2">
          {t("gateSignIn")}
        </Button>
      </div>
    );
  }

  return (
    <div className="container-site py-8">
      <header className="mb-6">
        <h1 className="text-h1 text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <nav aria-label={t("title")} className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map(({ href, key, icon: Icon }) => {
              const active =
                href === "/account" ? pathname === href : pathname.startsWith(href);
              return (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-field px-4 py-2.5 text-sm font-semibold transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-body hover:bg-surface-muted hover:text-ink",
                    )}
                  >
                    <Icon className="size-4.5 shrink-0" aria-hidden />
                    {t(`nav.${key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
