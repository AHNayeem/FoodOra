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
  ShoppingBag,
  LifeBuoy,
  Store,
  Bike,
  Banknote,
} from "lucide-react";
import type { UserRole } from "@/types";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { useCms } from "@/stores/cms";
import { liveTicketCount, useSupport } from "@/stores/support";
import {
  pendingRiderCount,
  pendingVendorCount,
  useOnboarding,
} from "@/stores/onboarding";
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
  // Phase 4: the board answers "what is happening"; this answers "find me that
  // order", which is the question a support call opens with.
  { href: "/admin/orders", key: "navOrders", icon: ShoppingBag },
  // Phase 5: `customer-support` was already an admin role with no queue behind it.
  { href: "/admin/support", key: "navSupport", icon: LifeBuoy },
  // Phases 6–7: the two onboarding queues. Separate entries rather than one
  // "Partners" section — a restaurant application and a rider application are
  // reviewed by different people against different paperwork.
  { href: "/admin/restaurants", key: "navRestaurants", icon: Store },
  { href: "/admin/riders", key: "navRiders", icon: Bike },
  // Phase 8: `finance-manager` has been an admin role with no surface behind it
  // since the auth seed, and the money owed had nowhere to be paid from.
  { href: "/admin/payouts", key: "navPayouts", icon: Banknote },
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

  // The one nav entry that carries a count: a dispute nobody has picked up is the
  // thing on this shell most likely to be waiting on somebody.
  const tickets = useSupport((s) => s.tickets);
  const supportHydrated = useSupport((s) => s.hydrated);
  const waiting = supportHydrated ? liveTicketCount(tickets) : 0;

  // The onboarding queues badge for the same reason: an application nobody has
  // looked at is somebody waiting on the platform to answer.
  const onboardingHydrated = useOnboarding((s) => s.hydrated);
  const vendorApplications = useOnboarding((s) => s.vendorApplications);
  const riderApplications = useOnboarding((s) => s.riderApplications);
  const badges: Record<string, number> = {
    navSupport: waiting,
    navRestaurants: onboardingHydrated ? pendingVendorCount(vendorApplications) : 0,
    navRiders: onboardingHydrated ? pendingRiderCount(riderApplications) : 0,
  };

  useEffect(() => {
    useAuth.persist.rehydrate();
    useOrders.persist.rehydrate();
    // The content desk's edits (C26) live here too, and every CMS surface is
    // gated on this store's `hydrated` flag.
    void useCms.persist.rehydrate();
    useSupport.persist.rehydrate();
    useOnboarding.persist.rehydrate();
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
                  {(badges[key] ?? 0) > 0 && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-pill bg-danger px-1.5 text-[11px] font-bold text-white tabular-nums">
                      {badges[key] > 99 ? "99+" : badges[key]}
                    </span>
                  )}
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
