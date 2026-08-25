"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2, Ticket } from "lucide-react";
import { claimCoupon, getGrantedClaims } from "@/services/coupons";
import { useCoupons } from "@/stores/coupons";
import { useCampaigns, useCampaignDesk } from "@/stores/campaigns";

/**
 * ClaimCoupon — the "save this code to my coupons" button beside a coupon code
 * on the deals page (Phase C21).
 *
 * This is the seam between a campaign (C20) and a held ticket: copying a code
 * leaves it on the clipboard, claiming it puts it in the wallet, where checkout
 * can find it without the customer having to remember anything. Once held, the
 * button becomes a link to the wallet rather than a second claim.
 */
export function ClaimCoupon({ code, couponId }: { code: string; couponId: string }) {
  const t = useTranslations("coupons");
  const claims = useCoupons((s) => s.claims);
  const hydrated = useCoupons((s) => s.hydrated);
  const seeded = useCoupons((s) => s.seeded);
  const seed = useCoupons((s) => s.seed);
  const addClaim = useCoupons((s) => s.addClaim);
  // Phase 12: an advertised code the platform desk has deactivated is refused by
  // the seam, so the deals page cannot hand out a campaign that is off.
  const desk = useCampaignDesk();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    useCoupons.persist.rehydrate();
    void useCampaigns.persist.rehydrate();
  }, []);
  useEffect(() => {
    if (hydrated && !seeded) getGrantedClaims().then(seed);
  }, [hydrated, seeded, seed]);

  const held = claims.some((c) => c.couponId === couponId);

  // Until the store has rehydrated, "held" is unknowable — render the neutral
  // state so the server and the first client render agree.
  if (!hydrated) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-line px-4 text-sm font-semibold text-muted">
        <Ticket className="size-4" aria-hidden />
        {t("save")}
      </span>
    );
  }

  if (held) {
    return (
      <Link
        href="/account/coupons"
        className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-fresh/10 px-4 text-sm font-semibold text-fresh-600 hover:bg-fresh/20"
      >
        <Check className="size-4" aria-hidden />
        {t("inWallet")}
      </Link>
    );
  }

  function claim() {
    setBusy(true);
    claimCoupon(code, claims, desk).then((res) => {
      setBusy(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.unknownCode"));
        return;
      }
      addClaim(res.data.claim, res.data.coupon);
      toast.success(t("claimed", { title: res.data.coupon.title }));
    });
  }

  return (
    <button
      type="button"
      onClick={claim}
      disabled={busy}
      className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-line px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Ticket className="size-4" aria-hidden />
      )}
      {t("save")}
    </button>
  );
}
