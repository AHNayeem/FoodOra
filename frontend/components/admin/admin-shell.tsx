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
  Users,
  Ticket,
  MessageSquareWarning,
  ScrollText,
} from "lucide-react";
import type { PlatformPermission } from "@/types";
import {
  canOpenAdmin,
  firstAdminRouteFor,
  hasPermission,
  permissionForAdminPath,
} from "@/lib/rbac";
import { useAudit } from "@/stores/audit";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { useCms } from "@/stores/cms";
import { useCustomers } from "@/stores/customers";
import { useCampaigns } from "@/stores/campaigns";
import { pendingModerationCount, useReviewModeration } from "@/stores/review-moderation";
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

/**
 * What platform operations actually does. C25 made this a section
 * rather than the single page the shell's comment used to describe: sending a
 * broadcast is a different job from watching the board, and squeezing a
 * composer onto the live-ops screen would have degraded both.
 *
 * Phase 14 gave every entry the permission that opens it. The list a given
 * account sees is this array filtered, and the permission is not repeated here —
 * it is read from `lib/rbac.ADMIN_ROUTE_PERMISSIONS`, the same table the route
 * gate below consults, so a nav entry and the page it points at can never
 * disagree about who may see it. That was the bug worth designing out: hiding a
 * link is not access control if the URL still works.
 */
const NAV = [
  { href: "/admin", key: "navOps", icon: Activity },
  // Phase 4: the board answers "what is happening"; this answers "find me that
  // order", which is the question a support call opens with.
  { href: "/admin/orders", key: "navOrders", icon: ShoppingBag },
  // Phase 5: `customer-support` was already an admin role with no queue behind it.
  { href: "/admin/support", key: "navSupport", icon: LifeBuoy },
  // Phase 11: the orders list finds an order and the queue finds a dispute;
  // neither could find a *person*, which is what a support call is about.
  { href: "/admin/customers", key: "navCustomers", icon: Users },
  // Phases 6–7: the two onboarding queues. Separate entries rather than one
  // "Partners" section — a restaurant application and a rider application are
  // reviewed by different people against different paperwork.
  { href: "/admin/restaurants", key: "navRestaurants", icon: Store },
  { href: "/admin/riders", key: "navRiders", icon: Bike },
  // Phase 8: `finance-manager` has been an admin role with no surface behind it
  // since the auth seed, and the money owed had nowhere to be paid from.
  { href: "/admin/payouts", key: "navPayouts", icon: Banknote },
  // Phase 12: the coupon engine existed and nobody could run a campaign with it.
  // Restaurant codes stay on the merchant's own dashboard — this is the
  // platform's book.
  { href: "/admin/coupons", key: "navCampaigns", icon: Ticket },
  // Phase 13: reports had nowhere to go. This is where they go.
  { href: "/admin/reviews", key: "navReviews", icon: MessageSquareWarning },
  // Phase 15: every important mutation on the platform, and who made it.
  { href: "/admin/audit", key: "navAudit", icon: ScrollText },
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
  // Phase 13: a reported review nobody has looked at is the third thing on this
  // shell that is waiting on a person, so it is badged for the same reason.
  const moderationHydrated = useReviewModeration((s) => s.hydrated);
  const moderationRecords = useReviewModeration((s) => s.records);
  const badges: Record<string, number> = {
    navSupport: waiting,
    navRestaurants: onboardingHydrated ? pendingVendorCount(vendorApplications) : 0,
    navRiders: onboardingHydrated ? pendingRiderCount(riderApplications) : 0,
    navReviews: moderationHydrated ? pendingModerationCount(moderationRecords) : 0,
  };

  /**
   * The sections this account can actually open.
   *
   * Filtered through the same table the route gate reads, so the two cannot drift.
   * A `null` from `permissionForAdminPath` would mean a nav entry pointing at a
   * path nobody gave a permission — kept visible rather than silently dropped,
   * because a link that vanishes for everybody is a bug that hides itself.
   */
  const visibleNav = NAV.filter(({ href }) => {
    const permission = permissionForAdminPath(href);
    return permission === null || hasPermission(user, permission as PlatformPermission);
  });

  useEffect(() => {
    useAuth.persist.rehydrate();
    useOrders.persist.rehydrate();
    // The content desk's edits (C26) live here too, and every CMS surface is
    // gated on this store's `hydrated` flag.
    void useCms.persist.rehydrate();
    useSupport.persist.rehydrate();
    useOnboarding.persist.rehydrate();
    // Phase 11: hydrated here as well as on the directory itself, so the
    // seeded accounts exist before any surface asks whether somebody is blocked.
    useCustomers.persist.rehydrate();
    // Phase 12–13: the campaign desk and the moderation queue. Both are hydrated
    // here as well as on their own screens, because the nav badge and the
    // customer-facing coupon surfaces read them before either screen is opened.
    void useCampaigns.persist.rehydrate();
    void useReviewModeration.persist.rehydrate();
    // Phase 15: hydrated here as well as on the audit screen, because every
    // mutation on every admin surface appends to it — a desk that acted before
    // the log had come up would have written into an empty store and had its
    // entry overwritten by the rehydrate.
    void Promise.resolve(useAudit.persist.rehydrate()).then(() =>
      useAudit.getState().seed(),
    );
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

  // Phase 14: two gates, not one. The first asks whether this account belongs in
  // platform operations at all; the second asks whether it belongs on *this*
  // page. Before RBAC there was only the first, and it was a role list that
  // admitted a moderator to the payout run.
  if (!canOpenAdmin(user)) {
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

  const required = permissionForAdminPath(pathname);
  /**
   * Refused rather than redirected, deliberately.
   *
   * A redirect would tell somebody who typed a URL that the page does not exist,
   * which is a different and less useful thing than "this exists and is not
   * yours". The panel offers the first section this account *can* open, so the
   * refusal is not a dead end — a marketing manager who lands on `/admin` (which
   * needs `orders.view`) gets a way through to campaigns instead of a wall.
   */
  if (required && !hasPermission(user, required)) {
    const fallback = firstAdminRouteFor(user);
    return (
      <CenterState>
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-accent-50 text-accent-600">
          <ShieldAlert className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">{t("noSectionTitle")}</h1>
        <p className="max-w-sm text-body">
          {t("noSectionBody", { permission: required })}
        </p>
        {fallback && fallback !== pathname && (
          <Button href={fallback} className="mt-2">
            {t("noSectionGo")}
          </Button>
        )}
        <Button href="/" variant="outline" className="mt-1">
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
          {visibleNav.map(({ href, key, icon: Icon }) => {
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
