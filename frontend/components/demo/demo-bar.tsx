"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Bike,
  ChevronUp,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import { useDemo, SPEED_OPTIONS } from "@/stores/demo";
import { useOrders, liveOrders } from "@/stores/orders";
import { useSupport } from "@/stores/support";
import { useOnboarding } from "@/stores/onboarding";
import { usePayouts } from "@/stores/payouts";
import { useMenu } from "@/stores/menu";
import { useStaff } from "@/stores/staff";
import { useCustomers } from "@/stores/customers";
import { useCampaigns } from "@/stores/campaigns";
import { useReviewModeration } from "@/stores/review-moderation";
import { useVendorSettings } from "@/stores/vendor-settings";
import { cn } from "@/lib/utils";

/**
 * DemoBar — the presenter's controls.
 *
 * A floating strip rather than a settings page, because it is used *while*
 * something else is on screen: pause the autopilot to make a point by hand,
 * speed it up to reach the end, reset the working set between audiences, and
 * jump between the four surfaces without typing a URL.
 *
 * Dismissible, and it remembers being dismissed — this is a prototype aid, not
 * part of the product, and it should be possible to take a clean screenshot.
 */
export function DemoBar() {
  const t = useTranslations("demo");

  const hydrated = useDemo((s) => s.hydrated);
  const autopilot = useDemo((s) => s.autopilot);
  const speed = useDemo((s) => s.speed);
  const barVisible = useDemo((s) => s.barVisible);
  const setAutopilot = useDemo((s) => s.setAutopilot);
  const setSpeed = useDemo((s) => s.setSpeed);
  const setBarVisible = useDemo((s) => s.setBarVisible);

  const ordersHydrated = useOrders((s) => s.hydrated);
  const orders = useOrders((s) => s.orders);
  const resetDemo = useOrders((s) => s.resetDemo);
  const resetTickets = useSupport((s) => s.resetDemo);
  const resetApplications = useOnboarding((s) => s.resetDemo);
  const resetPayouts = usePayouts((s) => s.resetDemo);
  const resetMenus = useMenu((s) => s.resetDemo);
  const resetSettings = useVendorSettings((s) => s.resetDemo);
  const resetStaff = useStaff((s) => s.resetDemo);
  const resetCustomers = useCustomers((s) => s.resetDemo);
  const resetCampaigns = useCampaigns((s) => s.resetDemo);
  const resetModeration = useReviewModeration((s) => s.resetDemo);

  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    useDemo.persist.rehydrate();
  }, []);

  // The rider app has its own fixed bottom tab bar. Sitting on top of the
  // navigation of the surface you are demonstrating is not a small annoyance —
  // it is the one place the bar must not be — so it lifts clear of it there.
  const clearsBottomNav = pathname.startsWith("/delivery");

  if (!hydrated) return null;

  // Collapsed to a tab once dismissed, so it is recoverable without devtools.
  if (!barVisible) {
    return (
      <button
        type="button"
        onClick={() => setBarVisible(true)}
        aria-label={t("show")}
        className={cn(
          "fixed end-3 z-[60] inline-flex size-9 items-center justify-center rounded-pill border border-line bg-surface/90 text-muted shadow-menu backdrop-blur transition-colors hover:text-ink",
          clearsBottomNav ? "bottom-20" : "bottom-3",
        )}
      >
        <ChevronUp className="size-4" aria-hidden />
      </button>
    );
  }

  const live = ordersHydrated ? liveOrders(orders).length : 0;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3",
        clearsBottomNav && "pb-20",
      )}
    >
      <div className="pointer-events-auto w-full max-w-2xl rounded-card border border-line bg-surface/95 shadow-menu backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 p-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-2.5 py-1 text-[11px] font-bold tracking-wide text-surface uppercase">
            {t("badge")}
          </span>

          {/* The switch that matters. */}
          <button
            type="button"
            onClick={() => {
              setAutopilot(!autopilot);
              toast.success(autopilot ? t("pausedToast") : t("resumedToast"));
            }}
            aria-pressed={autopilot}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-bold transition-colors",
              autopilot
                ? "bg-fresh-50 text-fresh-600 hover:bg-fresh-50/80"
                : "border border-line text-muted hover:text-ink",
            )}
          >
            {autopilot ? (
              <Pause className="size-3.5" aria-hidden />
            ) : (
              <Play className="size-3.5" aria-hidden />
            )}
            {autopilot ? t("autopilotOn") : t("autopilotOff")}
          </button>

          {/* Speed */}
          <div
            className="inline-flex items-center gap-0.5 rounded-pill border border-line p-0.5"
            role="radiogroup"
            aria-label={t("speed")}
          >
            <Gauge className="mx-1 size-3.5 text-muted" aria-hidden />
            {SPEED_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={speed === option}
                onClick={() => setSpeed(option)}
                className={cn(
                  "rounded-pill px-2 py-1 text-xs font-bold tabular-nums transition-colors",
                  speed === option
                    ? "bg-primary text-white"
                    : "text-muted hover:text-ink",
                )}
              >
                {option}×
              </button>
            ))}
          </div>

          <span className="text-xs font-semibold text-muted tabular-nums">
            {t("liveCount", { count: live })}
          </span>

          <div className="ms-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-surface-muted"
            >
              {t("surfaces")}
              <ChevronUp
                className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                aria-hidden
              />
            </button>
            <button
              type="button"
              onClick={() => setBarVisible(false)}
              aria-label={t("hide")}
              className="inline-flex size-8 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line p-2.5">
            <SurfaceLink href="/account/orders" icon={ShieldCheck} label={t("surfaceCustomer")} />
            <SurfaceLink href="/dashboard/orders" icon={Store} label={t("surfaceRestaurant")} />
            <SurfaceLink href="/delivery" icon={Bike} label={t("surfaceRider")} />
            <SurfaceLink href="/admin" icon={Gauge} label={t("surfaceAdmin")} />
            <button
              type="button"
              onClick={() => {
                resetDemo();
                // The support queue is seeded *from* the orders, so it has to be
                // rebuilt in the same breath or every ticket points at an order
                // that no longer exists (Phase 5).
                resetTickets();
                // Applications are seeded independently of the orders, but a
                // reset that left a device-approved restaurant behind would leave
                // a listing with no application to explain it (Phases 6–7).
                resetApplications();
                // A payout is recorded against a settlement period, and a reset
                // rebuilds the order book those periods were derived from — so a
                // surviving transfer would mark a week paid that no longer has the
                // orders to explain the amount (Phase 8).
                resetPayouts();
                // And the authored menus (Phase 9): a reset is for the next
                // audience, and a menu edited during the last demonstration would
                // be the one thing on screen nobody could explain.
                resetMenus();
                // And Phase 10's two: an edited profile and an invited colleague are
                // both decisions this device made about a restaurant, and leaving
                // them would open the next demonstration on somebody else's
                // settings. The owner's staff record is re-minted from the account
                // the moment the settings screen opens, so nothing is lost that the
                // accounts do not already say.
                resetSettings();
                resetStaff();
                // And Phase 11's directory: a block laid down during the last
                // demonstration would silently refuse the next reviewer's checkout
                // with no order history left on screen to explain why.
                resetCustomers();
                // And Phase 12's campaign desk: a campaign created for the last
                // demonstration would still be claimable, and a code deactivated
                // during it would refuse the next reviewer's checkout with nothing
                // on screen to explain it.
                resetCampaigns();
                // And Phase 13's moderation queue, which is rebuilt from the
                // review corpus for the same reason the support queue is rebuilt
                // from the orders: a decision left behind would hide a review the
                // reset has just put back.
                resetModeration();
                toast.success(t("resetToast"));
              }}
              className="ms-auto inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/5"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              {t("reset")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SurfaceLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Store;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:bg-surface-muted hover:text-ink"
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </Link>
  );
}
