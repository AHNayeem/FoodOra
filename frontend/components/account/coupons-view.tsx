"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, Loader2, Plus, Ticket } from "lucide-react";
import type { Coupon, HeldCoupon } from "@/types";
import type { ClaimableCoupon, CouponBook } from "@/services/coupons";
import { claimById, claimCoupon, getClaimableCoupons, getCouponBook, getGrantedClaims } from "@/services/coupons";
import { useCoupons } from "@/stores/coupons";
import { CouponTicket } from "@/components/coupons/coupon-ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "available" | "used" | "expired";

/**
 * CouponsView — the customer's coupon wallet (Phase C21).
 *
 * The store holds claims; this resolves them through `services/coupons` on every
 * change, so adding a code here re-runs exactly the join a page load would, and
 * a ticket's status always comes from the service's instant rather than a second
 * reading of the clock in the browser.
 *
 * Three tabs, because a coupon wallet is really three lists: what you can spend,
 * what you spent, and what you missed. The tab defaults to whichever has
 * something in it, and the claim field sits above all of them since a code
 * arrives from outside the app (a flyer, an SMS, a friend).
 */
export function CouponsView() {
  const t = useTranslations("coupons");
  const claims = useCoupons((s) => s.claims);
  const hydrated = useCoupons((s) => s.hydrated);
  const seeded = useCoupons((s) => s.seeded);
  const seed = useCoupons((s) => s.seed);
  const addClaim = useCoupons((s) => s.addClaim);

  const [book, setBook] = useState<CouponBook | null>(null);
  const [claimable, setClaimable] = useState<ClaimableCoupon[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);

  useEffect(() => {
    useCoupons.persist.rehydrate();
  }, []);

  // The account is issued its granted coupons once; after that the store owns them.
  useEffect(() => {
    if (hydrated && !seeded) getGrantedClaims().then(seed);
  }, [hydrated, seeded, seed]);

  useEffect(() => {
    if (!hydrated || !seeded) return;
    let live = true;
    getCouponBook(claims).then((next) => {
      if (live) setBook(next);
    });
    getClaimableCoupons(claims).then((next) => {
      if (live) setClaimable(next.coupons);
    });
    return () => {
      live = false;
    };
  }, [hydrated, seeded, claims]);

  if (!hydrated || !book) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  const groups: Record<Tab, HeldCoupon[]> = {
    available: book.held.filter((h) => h.status === "active" || h.status === "scheduled"),
    used: book.held.filter((h) => h.status === "used"),
    expired: book.held.filter((h) => h.status === "expired"),
  };
  const active: Tab =
    tab ??
    (groups.available.length > 0
      ? "available"
      : groups.used.length > 0
        ? "used"
        : "expired");

  function submitCode(value: string) {
    setBusy(true);
    claimCoupon(value, claims).then((res) => {
      setBusy(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.unknownCode"));
        return;
      }
      addClaim(res.data.claim, res.data.coupon);
      setCode("");
      toast.success(t("claimed", { title: res.data.coupon.title }));
    });
  }

  function claimSuggested(coupon: Coupon) {
    setBusy(true);
    claimById(coupon.id, claims).then((res) => {
      setBusy(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.unknownCode"));
        return;
      }
      addClaim(res.data.claim, res.data.coupon);
      toast.success(t("claimed", { title: coupon.title }));
    });
  }

  return (
    <div className="space-y-6">
      {/* Claim a code */}
      <section className="rounded-panel border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-h3 text-ink">
          <Ticket className="size-5 text-primary" aria-hidden />
          {t("claimTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("claimHint")}</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) submitCode(code);
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("codePlaceholder")}
            aria-label={t("claimTitle")}
            className="uppercase"
          />
          <Button type="submit" disabled={busy || code.trim().length === 0}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            {t("claim")}
          </Button>
        </form>
      </section>

      {book.held.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line bg-surface py-16 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
            <Ticket className="size-7" aria-hidden />
          </span>
          <p className="text-lg font-semibold text-ink">{t("emptyTitle")}</p>
          <p className="max-w-sm text-body">{t("emptyBody")}</p>
          <Button href="/offers" className="mt-2">
            {t("browseOffers")}
          </Button>
        </div>
      ) : (
        <section>
          <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-2">
            {(["available", "used", "expired"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active === key}
                onClick={() => setTab(key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-pill border px-4 py-2 text-sm font-semibold transition-colors",
                  active === key
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-line text-body hover:bg-surface-muted",
                )}
              >
                {t(`tab.${key}`)}
                <span className="rounded-pill bg-surface-muted px-1.5 text-xs text-muted">
                  {groups[key].length}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {groups[active].length === 0 ? (
              <p className="rounded-panel border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
                {t(`tabEmpty.${active}`)}
              </p>
            ) : (
              groups[active].map((held) => (
                <CouponTicket
                  key={held.coupon.id}
                  coupon={held.coupon}
                  status={held.status}
                  daysLeft={held.daysLeft}
                  remaining={held.remaining}
                  vendors={held.vendors}
                  note={
                    held.claim.redemptions.length > 0 ? (
                      <p className="text-xs text-muted">
                        {t("lastUsedOn", {
                          order: held.claim.redemptions[0].orderNumber,
                        })}
                      </p>
                    ) : undefined
                  }
                  actions={
                    held.status === "active" ? (
                      <>
                        <CopyButton code={held.coupon.code} />
                        <Link
                          href={
                            held.vendors.length === 1
                              ? `/restaurants/${held.vendors[0].slug}`
                              : "/restaurants"
                          }
                          className="inline-flex h-9 items-center rounded-pill bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600"
                        >
                          {t("useIt")}
                        </Link>
                      </>
                    ) : undefined
                  }
                />
              ))
            )}
          </div>
        </section>
      )}

      {/* Codes the customer could still claim */}
      {claimable.length > 0 && (
        <section>
          <h2 className="text-h3 text-ink">{t("suggestedTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("suggestedHint")}</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {claimable.map((entry) => (
              <CouponTicket
                key={entry.coupon.id}
                coupon={entry.coupon}
                status="active"
                daysLeft={entry.daysLeft}
                vendors={entry.vendors}
                compact
                actions={
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => claimSuggested(entry.coupon)}
                  >
                    <Plus className="size-4" aria-hidden />
                    {t("claim")}
                  </Button>
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Copy the code to the clipboard, with a toast fallback on insecure origins. */
function CopyButton({ code }: { code: string }) {
  const t = useTranslations("coupons");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(t("copied", { code }));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(t("copyFailed", { code }));
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
    >
      {copied ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
      {t("copyCode")}
    </button>
  );
}
