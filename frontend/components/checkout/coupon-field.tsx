"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles, Ticket, X } from "lucide-react";
import type { AppliedCoupon, CouponEvaluation } from "@/frontend/types";
import type { CouponOption } from "@/frontend/lib/coupons";
import type { CurrencyCode } from "@/frontend/config/regions";
import { CouponTicket } from "@/frontend/components/coupons/coupon-ticket";
import { Input } from "@/frontend/components/ui/input";
import { Modal } from "@/frontend/components/ui/modal";
import { formatPrice } from "@/frontend/lib/format";
import { cn } from "@/frontend/lib/utils";

/**
 * CouponField — the coupon step of the checkout summary (Phase C21), replacing
 * the promo-code box that shipped with C8.
 *
 * Two ways in, because customers arrive with a coupon in two different states:
 * a code copied from somewhere (typed, and claimed on the spot by the seam), or
 * a ticket already in the wallet (picked from the sheet). Both go through
 * `services/coupons`, so the discount shown here is one the seam agreed to.
 *
 * The sheet lists coupons that *don't* apply as well, each with the reason —
 * "add ৳150 more", "Bella Napoli only" — because "you have four coupons and can
 * use none of them" is a question the customer will otherwise ask themselves.
 */
export function CouponField({
  currency,
  options,
  applied,
  busy,
  onApplyCode,
  onApplyCoupon,
  onRemove,
}: {
  currency: CurrencyCode;
  /** The wallet priced against this basket; null while it loads. */
  options: CouponOption[] | null;
  applied: AppliedCoupon | null;
  busy: boolean;
  onApplyCode: (code: string) => void;
  onApplyCoupon: (couponId: string) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("coupons");
  const [code, setCode] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Spent and expired tickets stay in the wallet but have no business here —
  // the sheet is about this order, so it only shows what could still pay for it.
  const shown = options?.filter((o) => o.held.status !== "used" && o.held.status !== "expired");
  const best = shown?.find((o) => o.evaluation.eligible) ?? null;
  const held = shown?.length ?? 0;

  return (
    <div className="border-b border-line py-4">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Ticket className="size-4 text-muted" aria-hidden />
        {t("checkoutTitle")}
      </span>

      {applied ? (
        <div className="rounded-field bg-fresh/10 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block font-mono text-sm font-bold tracking-wider text-fresh-600">
                {applied.coupon.code}
              </span>
              <span className="block text-xs text-body">{applied.coupon.title}</span>
            </span>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted hover:text-danger"
            >
              <X className="size-3.5" aria-hidden /> {t("remove")}
            </button>
          </div>
          <p className="mt-1.5 text-xs font-semibold text-fresh-600">
            <SavingSummary evaluation={applied.evaluation} currency={currency} />
          </p>
        </div>
      ) : (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && code.trim()) onApplyCode(code);
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("codePlaceholder")}
              aria-label={t("checkoutTitle")}
              className="uppercase"
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-field border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-40"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              {t("apply")}
            </button>
          </form>

          {held > 0 && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-field border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-start hover:bg-primary/10"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-primary">
                  {best
                    ? t("bestSaving", {
                        amount: formatPrice(best.evaluation.totalSaving, currency),
                      })
                    : t("walletCount", { count: held })}
                </span>
                <span className="block truncate text-xs text-muted">
                  {best ? best.held.coupon.title : t("noneApplyHint")}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-primary">
                {t("view")}
              </span>
            </button>
          )}
        </>
      )}

      {pickerOpen && shown && (
        <Modal
          open
          onClose={() => setPickerOpen(false)}
          labelledBy="coupon-picker-title"
          className="max-h-[85vh] overflow-y-auto p-5"
        >
          <h2 id="coupon-picker-title" className="text-h3 text-ink">
            {t("pickerTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("pickerHint")}</p>
          <div className="mt-4 space-y-3">
            {shown.map(({ held: heldCoupon, evaluation }) => (
              <CouponTicket
                key={heldCoupon.coupon.id}
                coupon={heldCoupon.coupon}
                status={heldCoupon.status}
                daysLeft={heldCoupon.daysLeft}
                remaining={heldCoupon.remaining}
                vendors={heldCoupon.vendors}
                compact
                note={
                  evaluation.eligible ? (
                    <p className="font-semibold text-fresh-600">
                      <SavingSummary evaluation={evaluation} currency={currency} />
                    </p>
                  ) : (
                    <p className="text-xs text-muted">
                      {/* "Too small" is the one refusal the customer can act on,
                          so here — where the coupon is known — it names the figure. */}
                      {evaluation.reasonKey === "minOrder"
                        ? t("reason.minOrderAmount", {
                            amount: formatPrice(heldCoupon.coupon.minOrder, currency),
                          })
                        : t(`reason.${evaluation.reasonKey}`)}
                    </p>
                  )
                }
                actions={
                  <button
                    type="button"
                    disabled={!evaluation.eligible || busy}
                    onClick={() => {
                      onApplyCoupon(heldCoupon.coupon.id);
                      setPickerOpen(false);
                    }}
                    className={cn(
                      "inline-flex h-9 items-center rounded-pill px-4 text-sm font-semibold transition-colors",
                      evaluation.eligible
                        ? "bg-primary text-white hover:bg-primary-600"
                        : "cursor-not-allowed bg-surface-muted text-muted",
                    )}
                  >
                    {t("apply")}
                  </button>
                }
              />
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The three ways a coupon can pay, phrased as one line. */
function SavingSummary({
  evaluation,
  currency,
}: {
  evaluation: CouponEvaluation;
  currency: CurrencyCode;
}) {
  const t = useTranslations("coupons");
  const parts: string[] = [];
  if (evaluation.discount > 0) {
    parts.push(t("savingOff", { amount: formatPrice(evaluation.discount, currency) }));
  }
  if (evaluation.freeDelivery) {
    parts.push(t("savingDelivery", { amount: formatPrice(evaluation.deliveryWaived, currency) }));
  }
  if (evaluation.cashback > 0) {
    parts.push(t("savingCashback", { amount: formatPrice(evaluation.cashback, currency) }));
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {evaluation.cashback > 0 && <Sparkles className="size-3.5" aria-hidden />}
      {parts.join(" · ")}
    </span>
  );
}
