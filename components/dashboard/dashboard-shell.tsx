"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Calculator,
  Store,
  ExternalLink,
  LogOut,
  ShieldAlert,
  Lock,
} from "lucide-react";
import type { UserRole, Vendor } from "@/types";
import { useAuth } from "@/stores/auth";
import { useMerchant } from "@/stores/merchant";
import { getDashboardVendor } from "@/services/vendor";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LocaleSwitcher } from "@/components/ui/locale-switcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardProvider } from "./dashboard-context";

/** Roles allowed into the restaurant dashboard (riders/customers are not). */
const MANAGEMENT_ROLES: readonly UserRole[] = [
  "restaurant-owner",
  "cafe-owner",
  "home-chef",
  "cloud-kitchen",
  "catering-company",
  "vendor-manager",
  "super-admin",
];

const NAV = [
  { href: "/dashboard", key: "overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/orders", key: "orders", icon: ClipboardList, exact: false },
  { href: "/dashboard/pos", key: "pos", icon: Calculator, exact: false },
  { href: "/dashboard/menu", key: "menu", icon: UtensilsCrossed, exact: false },
] as const;

/** Centered state (spinner / gate messages) used before the dashboard renders. */
function CenterState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  );
}

/**
 * DashboardShell — the frame + gate for every `/dashboard` page (Phase C10).
 * Rehydrates the session and merchant desk, blocks non-management accounts,
 * resolves the "my restaurant" vendor once, then renders the sidebar + topbar
 * around the page. Client-side gate only (no server session in the prototype).
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("dashboard");
  const pathname = usePathname();
  const router = useRouter();

  const user = useAuth((s) => s.user);
  const authHydrated = useAuth((s) => s.hydrated);
  const signOut = useAuth((s) => s.signOut);

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loadingVendor, setLoadingVendor] = useState(true);

  useEffect(() => {
    useAuth.persist.rehydrate();
    useMerchant.persist.rehydrate();
  }, []);

  const canManage = !!user && MANAGEMENT_ROLES.includes(user.role);

  useEffect(() => {
    if (!canManage || !user) return;
    let active = true;
    getDashboardVendor(user.id)
      .then((v) => {
        if (active) setVendor(v);
      })
      .finally(() => {
        if (active) setLoadingVendor(false);
      });
    return () => {
      active = false;
    };
  }, [canManage, user]);

  function handleSignOut() {
    signOut();
    toast.success(t("signedOut"));
    router.push("/");
  }

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
      </CenterState>
    );
  }

  if (!canManage) {
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

  if (loadingVendor || !vendor) {
    return (
      <CenterState>
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </CenterState>
    );
  }

  return (
    <DashboardProvider vendor={vendor}>
      <div className="flex min-h-screen bg-surface-muted">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-e border-line bg-surface lg:flex">
          <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
            <span className="inline-flex size-8 items-center justify-center rounded-field bg-primary text-white">
              <Store className="size-4.5" aria-hidden />
            </span>
            <span className="text-sm font-extrabold tracking-tight text-ink">
              {t("brand")}
            </span>
          </div>
          <nav aria-label={t("brand")} className="flex-1 space-y-1 p-3">
            {NAV.map(({ href, key, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-field px-3.5 py-2.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-body hover:bg-surface-muted hover:text-ink",
                  )}
                >
                  <Icon className="size-4.5 shrink-0" aria-hidden />
                  {t(`nav.${key}`)}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-line p-3">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-field px-3.5 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/5"
            >
              <LogOut className="size-4.5 rtl:rotate-180" aria-hidden />
              {t("signOut")}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{vendor.name}</p>
              <p className="truncate text-xs text-muted">{t("topbarTagline")}</p>
            </div>

            <StoreStatusToggle />

            <div className="flex items-center gap-1">
              <LocaleSwitcher className="hidden sm:inline-flex" />
              <ThemeToggle />
              <Link
                href="/"
                className="inline-flex size-10 items-center justify-center rounded-pill text-ink transition-colors hover:bg-surface-muted"
                aria-label={t("viewSite")}
                title={t("viewSite")}
              >
                <ExternalLink className="size-5 rtl:-scale-x-100" aria-hidden />
              </Link>
            </div>
          </header>

          {/* Mobile nav */}
          <nav
            aria-label={t("brand")}
            className="flex gap-1.5 overflow-x-auto border-b border-line bg-surface px-4 py-2 lg:hidden"
          >
            {NAV.map(({ href, key, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-pill px-3.5 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-body hover:bg-surface-muted",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {t(`nav.${key}`)}
                </Link>
              );
            })}
          </nav>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
        </div>
      </div>
    </DashboardProvider>
  );
}

/** The storefront online/offline switch in the topbar (persisted, simulated). */
function StoreStatusToggle() {
  const t = useTranslations("dashboard");
  const online = useMerchant((s) => s.online);
  const hydrated = useMerchant((s) => s.hydrated);
  const setOnline = useMerchant((s) => s.setOnline);

  function toggle() {
    const next = !online;
    setOnline(next);
    toast.success(next ? t("nowOnline") : t("nowOffline"));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={online}
      aria-label={t("storeStatus")}
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
