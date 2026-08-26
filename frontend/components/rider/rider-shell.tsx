"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Bike,
  ChevronRight,
  ExternalLink,
  History,
  Lock,
  Navigation,
  ShieldAlert,
  User as UserIcon,
  Wallet,
  Zap,
} from "lucide-react";
import type { DeliveryZone, Rider, RiderApplication, UserRole } from "@/types";
import { useAuth } from "@/stores/auth";
import { useRider } from "@/stores/rider";
import { useOnboarding } from "@/stores/onboarding";
import { canDispatchToRider, canUseRiderApp } from "@/lib/rider-onboarding";
import { usePlatformDraft } from "@/stores/platform-settings";
import { platformSettingsOf } from "@/services/platform-settings";
import { getRiderProfile, getRiderZone, nextStopOf } from "@/services/delivery";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LocaleSwitcher } from "@/components/ui/locale-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasReached } from "@/lib/order-machine";
import { RiderProvider } from "./rider-context";
import { useRiderRecords } from "./use-rider-records";

/** Roles allowed into the rider app. Support/admin can look; customers cannot. */
const RIDER_ROLES: readonly UserRole[] = ["delivery-rider", "super-admin"];

const NAV = [
  { href: "/delivery", key: "today", icon: Zap, exact: true },
  { href: "/delivery/history", key: "trips", icon: History, exact: false },
  { href: "/delivery/earnings", key: "earnings", icon: Bike, exact: false },
  { href: "/delivery/wallet", key: "wallet", icon: Wallet, exact: false },
  { href: "/delivery/profile", key: "profile", icon: UserIcon, exact: false },
] as const;

function CenterState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  );
}

/**
 * RiderShell — the frame and gate for every `/delivery` screen (Phase C18).
 *
 * Deliberately shaped like a phone app rather than a dashboard: a narrow column,
 * a compact top bar carrying the one control that matters all day (on shift /
 * off shift) and a bottom tab bar, because a rider uses this one-handed on a
 * bike mount, not at a desk. The vendor dashboard's sidebar would be the wrong
 * answer to the same problem.
 *
 * It rehydrates the session and the rider's device state, blocks non-rider
 * accounts, resolves the rider and their zone once, and keeps a persistent
 * pointer back to a trip in progress so a rider cannot lose their live delivery
 * by tapping into another tab.
 */
export function RiderShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("delivery");
  const pathname = usePathname();

  const user = useAuth((s) => s.user);
  const authHydrated = useAuth((s) => s.hydrated);

  const [resolved, setResolved] = useState<{
    rider: Rider | null;
    zone: DeliveryZone | null;
  } | null>(null);

  // Phase 7: onboarding decides whether this app opens and whether the rider may
  // be given work, so it is rehydrated with the session.
  const onboardingHydrated = useOnboarding((s) => s.hydrated);
  const riderApplications = useOnboarding((s) => s.riderApplications);
  const admittedRiders = useOnboarding((s) => s.admittedRiders);

  useEffect(() => {
    useAuth.persist.rehydrate();
    useRider.persist.rehydrate();
    useOnboarding.persist.rehydrate();
  }, []);

  const canRide = !!user && RIDER_ROLES.includes(user.role);

  /**
   * The delivery network as the platform is configured (Phase 19, G30). The whole
   * folded list rather than the open zones: this resolves the courier's *own*
   * zone for the chrome, and a courier whose zone an operator has closed still
   * has to be able to open the app and read why their fares changed.
   */
  const platform = usePlatformDraft();
  const zones = useMemo(() => platformSettingsOf(platform).zones, [platform]);

  useEffect(() => {
    if (!canRide || !user || !onboardingHydrated) return;
    let active = true;
    // Injected admitted riders, no flagship fallback — see `getRiderProfile`.
    getRiderProfile(user.id, admittedRiders)
      .then(async (rider) => {
        const zone = rider ? await getRiderZone(rider.zoneId, zones) : null;
        if (active) setResolved({ rider, zone });
      })
      .catch(() => {
        if (active) setResolved({ rider: null, zone: null });
      });
    return () => {
      active = false;
    };
  }, [canRide, user, onboardingHydrated, admittedRiders, zones]);

  /**
   * This account's application: by fleet record when there is one, by account when
   * there is not — the same two-step the dashboard shell uses, and for the same
   * reason.
   */
  const application: RiderApplication | undefined = resolved?.rider
    ? riderApplications.find((a) => a.riderId === resolved.rider!.id && !a.deletedAt)
    : user
      ? riderApplications.find((a) => a.userId === user.id && !a.deletedAt)
      : undefined;

  const setRider = useCallback((rider: Rider) => {
    setResolved((prev) => (prev ? { ...prev, rider } : prev));
    // A zone change has to be reflected in the chrome straight away.
    getRiderZone(rider.zoneId, zones).then((zone) =>
      setResolved((prev) => (prev ? { ...prev, zone: zone ?? prev.zone } : prev)),
    );
  }, [zones]);

  if (!authHydrated) {
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
        <Link href="/rider" className="text-sm font-semibold text-primary hover:underline">
          {t("gateBecomeRider")}
        </Link>
      </CenterState>
    );
  }

  if (!canRide) {
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

  if (!resolved || !onboardingHydrated) {
    return (
      <CenterState>
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </CenterState>
    );
  }

  /**
   * No fleet record on this account (spec §5.3, G11).
   *
   * Reachable for the first time in Phase 7: `getRiderProfile` used to hand back
   * the flagship rider, so any rider-role account silently worked as Rakib. If the
   * account has an application in flight, its status is what they are shown —
   * "you are not a rider" is the wrong answer for somebody who applied yesterday.
   */
  if (!resolved.rider || !resolved.zone) {
    return (
      <CenterState>
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <Bike className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">
          {application ? t(`gate.${application.status}Title`) : t("noRiderTitle")}
        </h1>
        <p className="max-w-sm text-body">
          {application ? t(`gate.${application.status}Body`) : t("noRiderBody")}
        </p>
        {application?.decisionNote && (
          <p className="max-w-sm rounded-card border border-line bg-surface p-3 text-sm text-body">
            {application.decisionNote}
          </p>
        )}
        <Button href="/rider/apply" variant="outline" className="mt-2">
          {application ? t("gate.viewApplication") : t("gateBecomeRider")}
        </Button>
      </CenterState>
    );
  }

  /**
   * A fleet record whose application was never approved. Rare — the seed gives
   * every rider a record — but the honest answer if it happens, rather than opening
   * an app that dispatch will never send anything to.
   */
  if (!application || !canUseRiderApp(application.status)) {
    return (
      <CenterState>
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-danger/10 text-danger">
          <ShieldAlert className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">
          {application ? t(`gate.${application.status}Title`) : t("gate.unknownTitle")}
        </h1>
        <p className="max-w-sm text-body">
          {application ? t(`gate.${application.status}Body`) : t("gate.unknownBody")}
        </p>
        <Button href="/rider/apply" variant="outline" className="mt-2">
          {t("gate.viewApplication")}
        </Button>
      </CenterState>
    );
  }

  const { rider, zone } = resolved;
  /**
   * Approved and therefore allowed to take work. A suspended or deactivated rider
   * gets the app — their history, their wallet, and the reason — but not the shift
   * switch, because turning it on would put them back in a pool dispatch is already
   * refusing to draw from, and the switch would appear to do nothing.
   */
  const working = canDispatchToRider(application.status);

  return (
    <RiderProvider rider={rider} zone={zone} setRider={setRider}>
      <div className="flex min-h-screen flex-col bg-surface-muted">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-2xl items-center gap-3 px-4">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-field bg-primary text-white">
              <Bike className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold tracking-tight text-ink">
                {t("brand")}
              </p>
              <p className="truncate text-xs text-muted">{zone.name}</p>
            </div>
            {working ? (
              <ShiftToggle />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-xs font-semibold text-danger">
                <ShieldAlert className="size-3.5" aria-hidden />
                {t(`gate.${application.status}Badge`)}
              </span>
            )}
            <div className="flex items-center">
              <LocaleSwitcher className="hidden sm:inline-flex" />
              <ThemeToggle />
              <NotificationBell audience="rider" />
              <Link
                href="/"
                aria-label={t("viewSite")}
                title={t("viewSite")}
                className="inline-flex size-10 items-center justify-center rounded-pill text-ink transition-colors hover:bg-surface-muted"
              >
                <ExternalLink className="size-5 rtl:-scale-x-100" aria-hidden />
              </Link>
            </div>
          </div>
        </header>

        <ActiveTripBar />

        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-5 pb-28">{children}</main>

        <nav
          aria-label={t("brand")}
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
          <div className="mx-auto flex w-full max-w-2xl">
            {NAV.map(({ href, key, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.6875rem] font-semibold transition-colors",
                    active ? "text-primary" : "text-muted hover:text-ink",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {t(`nav.${key}`)}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </RiderProvider>
  );
}

/**
 * The on-shift switch. Going offline does not abandon a trip in progress — a
 * rider who has food in their bag still has to deliver it — it only stops new
 * offers arriving, which is what the seam enforces too.
 *
 * Flipping it also publishes to the shared availability board, so dispatch stops
 * handing this rider real orders the moment they go home (G40). That used to be
 * two separate truths: the offer pool respected the switch and the dispatcher
 * could not even see it.
 */
function ShiftToggle() {
  const t = useTranslations("delivery");
  const { online, hydrated } = useRiderRecords();
  const setOnline = useRider((s) => s.setOnline);

  function toggle() {
    const next = !online;
    setOnline(next, next ? new Date().toISOString() : null);
    toast.success(next ? t("nowOnline") : t("nowOffline"));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={online}
      aria-label={t("shiftStatus")}
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border py-1.5 ps-2.5 pe-1.5 text-xs font-semibold transition-colors",
        !hydrated && "opacity-0",
        online
          ? "border-fresh/30 bg-fresh/10 text-fresh-600"
          : "border-line bg-surface-muted text-muted",
      )}
    >
      <span className="hidden sm:inline">
        {online ? t("statusOnline") : t("statusOffline")}
      </span>
      <span
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-pill transition-colors",
          online ? "bg-fresh" : "bg-line",
        )}
      >
        <span
          className={cn(
            "inline-block size-4 rounded-pill bg-white shadow-sm transition-transform",
            online ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0.5 rtl:-translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

/**
 * A persistent way back to the work in progress, on every screen but that work's
 * own.
 *
 * It covers *both* kinds now (G39). A rider carrying a real customer's order used
 * to lose it the moment they tapped another tab — the bar only knew about
 * synthesised trips — which is the clearest symptom there was of the two systems
 * not knowing about each other. The real order wins when somehow both exist,
 * because a customer is waiting on it.
 */
function ActiveTripBar() {
  const t = useTranslations("delivery");
  const pathname = usePathname();
  const { hydrated, activeJob, activeOrder } = useRiderRecords();
  const [now] = useState(() => Date.now());

  if (!hydrated) return null;

  const work = activeOrder
    ? {
        href: `/delivery/order/${activeOrder.id}`,
        ref: activeOrder.orderNumber,
        // Before the pickup the rider is riding to the kitchen; after it, to the door.
        label: hasReached(activeOrder, "picked-up")
          ? t("barDeliverTo", { name: activeOrder.contact.name })
          : t("barCollectFrom", { name: activeOrder.vendor.name }),
      }
    : activeJob
      ? (() => {
          const next = nextStopOf(activeJob, now);
          return {
            href: `/delivery/trip/${activeJob.id}`,
            ref: activeJob.jobNumber,
            label: next
              ? t(next.kind === "pickup" ? "barCollectFrom" : "barDeliverTo", {
                  name: next.name,
                })
              : t("barFinish"),
          };
        })()
      : null;

  if (!work || pathname.startsWith(work.href)) return null;

  return (
    <Link
      href={work.href}
      className="block bg-primary text-white transition-colors hover:bg-primary-600"
    >
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-2.5">
        <Navigation className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{work.label}</p>
        <span className="text-xs font-bold whitespace-nowrap">{work.ref}</span>
        <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
      </div>
    </Link>
  );
}
