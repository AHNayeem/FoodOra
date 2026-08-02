"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  BadgePercent,
  Bike,
  Cake,
  ChevronDown,
  Gift,
  HeartHandshake,
  Sparkles,
  Store,
  Ticket,
  UserPlus,
} from "lucide-react";
import type {
  Coupon,
  CouponKind,
  CouponSource,
  CouponStatus,
  CouponVendorRef,
} from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * CouponTicket — the one way a coupon is drawn anywhere in the app: the wallet,
 * the checkout picker, the deals page's claim rail and the merchant's own list.
 *
 * It is a ticket, not a card: a perforated stub carries the value, the body
 * carries the terms, and a status pill says whether it can still be torn off.
 * Everything it shows is passed in — status and days-left are derived by
 * `lib/coupons` against the instant the service resolved, never re-derived here
 * from a second reading of the clock.
 */

/** The `coupons` namespace translator, as far as this file needs it. */
type T = (key: string, values?: Record<string, string | number | Date>) => string;

const KIND_ICON: Record<CouponKind, typeof Ticket> = {
  percentage: BadgePercent,
  fixed: Ticket,
  "free-delivery": Bike,
  bogo: Gift,
  cashback: Sparkles,
};

const SOURCE_ICON: Record<CouponSource, typeof Ticket> = {
  campaign: BadgePercent,
  welcome: Sparkles,
  referral: UserPlus,
  loyalty: Gift,
  apology: HeartHandshake,
  birthday: Cake,
  vendor: Store,
};

const STATUS_TONE: Record<CouponStatus, string> = {
  active: "bg-fresh-50 text-fresh-600",
  scheduled: "bg-accent-50 text-accent-600",
  used: "bg-surface-muted text-muted",
  expired: "bg-surface-muted text-muted",
};

/**
 * The headline value, phrased per kind — "40% off", "Save ৳150", "Free
 * delivery", "Buy 1 get 1", "5% back". Exported because the checkout picker and
 * the merchant table want the same phrase without the whole ticket.
 */
export function couponValueLabel(coupon: Coupon, t: T): string {
  const currency = coupon.currency as CurrencyCode;
  switch (coupon.kind) {
    case "percentage":
      return t("value.percentage", { value: coupon.value });
    case "fixed":
      return t("value.fixed", { amount: formatPrice(coupon.value, currency) });
    case "free-delivery":
      return t("value.freeDelivery");
    case "bogo":
      return t("value.bogo");
    case "cashback":
      return t("value.cashback", { value: coupon.value });
  }
}

export function CouponTicket({
  coupon,
  status,
  daysLeft,
  remaining,
  vendors = [],
  note,
  actions,
  selected = false,
  compact = false,
}: {
  coupon: Coupon;
  status: CouponStatus;
  /** Whole days before expiry, from the service's instant. */
  daysLeft: number;
  /** Uses left for this customer; omitted on the merchant's own coupons. */
  remaining?: number;
  /** Vendors it is limited to, already resolved by the seam. */
  vendors?: CouponVendorRef[];
  /** A line under the terms — the saving on this basket, or why it can't apply. */
  note?: React.ReactNode;
  actions?: React.ReactNode;
  selected?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("coupons");
  const [showTerms, setShowTerms] = useState(false);
  const KindIcon = KIND_ICON[coupon.kind];
  const SourceIcon = SOURCE_ICON[coupon.source];
  const currency = coupon.currency as CurrencyCode;
  const spent = status === "used" || status === "expired";

  return (
    <article
      className={cn(
        "flex overflow-hidden rounded-panel border bg-surface transition-colors",
        selected ? "border-primary ring-2 ring-primary/20" : "border-line",
        spent && "opacity-70",
      )}
    >
      {/* Stub: the value, on a dashed perforation. */}
      <div
        className={cn(
          "relative flex shrink-0 flex-col items-center justify-center gap-1 border-e border-dashed border-line px-4 text-center",
          compact ? "w-24 py-3" : "w-28 py-5",
          spent ? "bg-surface-muted" : "bg-primary/5",
        )}
      >
        {/* The two notches that make the perforation read as a tear-off. */}
        <span
          className="absolute -top-2 -end-2 size-4 rounded-full bg-surface-muted"
          aria-hidden
        />
        <span
          className="absolute -bottom-2 -end-2 size-4 rounded-full bg-surface-muted"
          aria-hidden
        />
        <KindIcon
          className={cn("size-5", spent ? "text-muted" : "text-primary")}
          aria-hidden
        />
        <span
          className={cn(
            "text-sm font-extrabold leading-tight",
            spent ? "text-muted" : "text-primary",
          )}
        >
          {couponValueLabel(coupon, t)}
        </span>
      </div>

      <div className={cn("min-w-0 flex-1", compact ? "p-3.5" : "p-4")}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-bold text-ink">{coupon.title}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <SourceIcon className="size-3.5 shrink-0" aria-hidden />
              {t(`source.${coupon.source}`)}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold",
              STATUS_TONE[status],
            )}
          >
            {status === "active" && daysLeft <= 3
              ? t("expiresIn", { count: daysLeft })
              : t(`status.${status}`)}
          </span>
        </div>

        {!compact && <p className="mt-2 text-sm text-body">{coupon.description}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-field border border-dashed border-primary/50 bg-primary/5 px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-primary">
            {coupon.code}
          </span>
          {coupon.minOrder > 0 && (
            <span className="text-xs text-muted">
              {t("minOrder", { amount: formatPrice(coupon.minOrder, currency) })}
            </span>
          )}
          {remaining !== undefined && coupon.usageLimit > 1 && status !== "expired" && (
            <span className="text-xs text-muted">
              {t("usesLeft", { count: remaining })}
            </span>
          )}
        </div>

        {vendors.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <Store className="size-3.5 shrink-0" aria-hidden />
            {t("validAt", { vendors: vendors.map((v) => v.name).join(", ") })}
          </p>
        )}

        {note && <div className="mt-3 text-sm">{note}</div>}

        {coupon.terms.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowTerms((v) => !v)}
              aria-expanded={showTerms}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
            >
              {t("terms")}
              <ChevronDown
                className={cn("size-3.5 transition-transform", showTerms && "rotate-180")}
                aria-hidden
              />
            </button>
            {showTerms && (
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {coupon.terms.map((term) => (
                  <li key={term} className="flex gap-1.5">
                    <span aria-hidden>·</span>
                    {term}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </article>
  );
}
