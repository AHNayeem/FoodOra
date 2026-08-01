"use client";

import { useCallback, useEffect, useState } from "react";
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
import type { DeliveryZone, Rider, UserRole } from "@/types";
import { useAuth } from "@/stores/auth";
import { useRider } from "@/stores/rider";
import { getRiderProfile, getRiderZone, nextStopOf } from "@/services/delivery";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LocaleSwitcher } from "@/components/ui/locale-switcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RiderProvider } from "./rider-context";

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

  useEffect(() => {
    useAuth.persist.rehydrate();
    useRider.persist.rehydrate();
  }, []);

  const canRide = !!user && RIDER_ROLES.includes(user.role);

  useEffect(() => {
    if (!canRide || !user) return;
    let active = true;
    getRiderProfile(user.id)
      .then(async (rider) => {
        const zone = rider ? await getRiderZone(rider.zoneId) : null;
        if (active) setResolved({ rider, zone });
      })
      .catch(() => {
        if (active) setResolved({ rider: null, zone: null });
      });
    return () => {
      active = false;
    };
  }, [canRide, user]);

  const setRider = useCallback((rider: Rider) => {
    setResolved((prev) => (prev ? { ...prev, rider } : prev));
    // A zone change has to be reflected in the chrome straight away.
    getRiderZone(rider.zoneId).then((zone) =>
      setResolved((prev) => (prev ? { ...prev, zone: zone ?? prev.zone } : prev)),
    );
  }, []);

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

  if (!resolved) {
    return (
      <CenterState>
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </CenterState>
    );
  }

  if (!resolved.rider || !resolved.zone) {
    return (
      <CenterState>
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <Bike className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">{t("noRiderTitle")}</h1>
        <p className="max-w-sm text-body">{t("noRiderBody")}</p>
        <Button href="/rider" variant="outline" className="mt-2">
          {t("gateBecomeRider")}
        </Button>
      </CenterState>
    );
  }

  const { rider, zone } = resolved;

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
            <ShiftToggle />
            <div className="flex items-center">
              <LocaleSwitcher className="hidden sm:inline-flex" />
              <ThemeToggle />
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
 */
function ShiftToggle() {
  const t = useTranslations("delivery");
  const online = useRider((s) => s.online);
  const hydrated = useRider((s) => s.hydrated);
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

/** A persistent way back to the live trip, on every screen but the trip itself. */
function ActiveTripBar() {
  const t = useTranslations("delivery");
  const pathname = usePathname();
  const job = useRider((s) => s.activeJob);
  const hydrated = useRider((s) => s.hydrated);
  const [now] = useState(() => Date.now());

  if (!hydrated || !job || pathname.startsWith(`/delivery/trip/${job.id}`)) return null;
  const next = nextStopOf(job, now);

  return (
    <Link
      href={`/delivery/trip/${job.id}`}
      className="block bg-primary text-white transition-colors hover:bg-primary-600"
    >
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-2.5">
        <Navigation className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {next
            ? t(next.kind === "pickup" ? "barCollectFrom" : "barDeliverTo", {
                name: next.name,
              })
            : t("barFinish")}
        </p>
        <span className="text-xs font-bold whitespace-nowrap">{job.jobNumber}</span>
        <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
      </div>
    </Link>
  );
}
