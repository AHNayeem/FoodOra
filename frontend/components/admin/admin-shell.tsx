"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Activity,
  Bell,
  FileText,
  ExternalLink,
  Lock,
  LogOut,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { UserRole } from "@/types";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { useCms } from "@/stores/cms";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LocaleSwitcher } from "@/components/ui/locale-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Roles allowed into platform admin. */
const ADMIN_ROLES: readonly UserRole[] = [
  "super-admin",
  "customer-support",
  "moderator",
  "finance-manager",
];

/**
 * What platform operations actually does. C25 made this a section
 * rather than the single page the shell's comment used to describe: sending a
 * broadcast is a different job from watching the board, and squeezing a
 * composer onto the live-ops screen would have degraded both.
 */
const NAV = [
  { href: "/admin", key: "navOps", icon: Activity },
  { href: "/admin/cms", key: "navContent", icon: FileText },
  { href: "/admin/notifications", key: "navNotifications", icon: Bell },
] as const;

function CenterState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  );
}

/**
 * AdminShell — the frame and gate for `/admin`.
 *
 * The spec lists an admin surface among the four dashboards and the prototype
 * had none, which meant "Admin dashboard updates" and "Live Order Updates" were
 * unimplementable claims. It is deliberately one page rather than a section: the
 * question an operations desk asks during a demonstration is "what is happening
 * right now, and is anything stuck", and a sidebar of half-built subsections
 * would answer it worse.
 *
 * Same client-side gate as the vendor dashboard — there is no server session in
 * the prototype. Sign in as `admin@foodora.dev`.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const pathname = usePathname();

  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);
  const signOut = useAuth((s) => s.signOut);

  useEffect(() => {
    useAuth.persist.rehydrate();
    useOrders.persist.rehydrate();
    // The content desk's edits (C26) live here too, and every CMS surface is
    // gated on this store's `hydrated` flag.
    void useCms.persist.rehydrate();
  }, []);

  if (!hydrated) {
    return (
      <CenterState>
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </CenterState>
    );
  }

  if (!user) {
    return (
      <CenterState>
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <Lock className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">{t("gateTitle")}</h1>
        <p className="max-w-sm text-body">{t("gateBody")}</p>
        <Button href="/login" className="mt-2">
          {t("gateSignIn")}
        </Button>
      </CenterState>
    );
  }

  if (!ADMIN_ROLES.includes(user.role)) {
    return (
      <CenterState>
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-danger/10 text-danger">
          <ShieldAlert className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">{t("noAccessTitle")}</h1>
        <p className="max-w-sm text-body">{t("noAccessBody")}</p>
        <Button href="/" variant="outline" className="mt-2">
          {t("backToSite")}
        </Button>
      </CenterState>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-field bg-ink text-surface">
          <ShieldCheck className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{t("brand")}</p>
          <p className="truncate text-xs text-muted">{t("tagline")}</p>
        </div>
        <LocaleSwitcher className="hidden sm:inline-flex" />
        <ThemeToggle />
        <NotificationBell audience="admin" />
        <Link
          href="/"
          aria-label={t("viewSite")}
          className="inline-flex size-10 items-center justify-center rounded-pill border border-line text-ink transition-colors hover:bg-surface-muted"
        >
          <ExternalLink className="size-4" aria-hidden />
        </Link>
        <button
          type="button"
          aria-label={t("signOut")}
          onClick={() => {
            signOut();
            toast.success(t("signedOut"));
            router.push("/");
          }}
          className="inline-flex size-10 items-center justify-center rounded-pill border border-line text-danger transition-colors hover:bg-danger/5"
        >
          <LogOut className="size-4 rtl:rotate-180" aria-hidden />
        </button>
      </header>

      <nav
        aria-label={t("brand")}
        className="border-b border-line bg-surface px-4 sm:px-6"
      >
        <ul className="mx-auto flex max-w-7xl gap-1.5 overflow-x-auto">
          {NAV.map(({ href, key, icon: Icon }) => {
            const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-body hover:text-ink",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {t(key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
