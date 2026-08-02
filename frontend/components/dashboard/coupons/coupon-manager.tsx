"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BadgePercent, Plus, Ticket, TrendingUp, Wallet } from "lucide-react";
import type { Coupon, CouponKind } from "@/types";
import type { VendorCouponBoard } from "@/services/coupons";
import {
  createVendorCoupon,
  endVendorCoupon,
  getVendorCoupons,
  type NewVendorCoupon,
} from "@/services/coupons";
import type { CurrencyCode } from "@/config/regions";
import { useMerchant } from "@/stores/merchant";
import { couponValueLabel } from "@/components/coupons/coupon-ticket";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDashboard } from "../dashboard-context";

const KINDS: CouponKind[] = ["percentage", "fixed", "free-delivery"];

/**
 * CouponManager — the merchant's coupon book (Phase C21).
 *
 * A restaurant's coupons are the same entity a customer holds; this screen is
 * the other end of it. Codes issued here are claimable but never advertised on
 * `/offers`, which is the actual difference between a campaign and a counter-
 * card code.
 *
 * Ending a campaign closes its window rather than deleting it — the coupon stays
 * readable and its redemptions keep counting, exactly as the UPDATE a backend
 * would run. Both the created coupons and the end times live in the merchant
 * store and are handed back to the seam on every read (the C16/C18 context
 * pattern), so the only thing a real database changes is that parameter.
 */
export function CouponManager() {
  const t = useTranslations("coupons");
  const { vendor } = useDashboard();
  const currency = vendor.currency as CurrencyCode;

  const created = useMerchant((s) => s.coupons);
  const endedAt = useMerchant((s) => s.couponEndedAt);
  const hydrated = useMerchant((s) => s.hydrated);
  const addCoupon = useMerchant((s) => s.addCoupon);
  const endCouponLocally = useMerchant((s) => s.endCoupon);

  const [board, setBoard] = useState<VendorCouponBoard | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    let live = true;
    getVendorCoupons(vendor.id, { created, endedAt }).then((next) => {
      if (live) setBoard(next);
    });
    return () => {
      live = false;
    };
  }, [vendor.id, created, endedAt, hydrated]);

  function handleCreate(input: NewVendorCoupon) {
    setBusy(true);
    createVendorCoupon(vendor.id, input, { created, endedAt }, currency).then((res) => {
      setBusy(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      addCoupon(res.data);
      setCreateOpen(false);
      toast.success(t("created", { code: res.data.code }));
    });
  }

  function handleEnd(coupon: Coupon) {
    setBusy(true);
    endVendorCoupon(coupon.id, { created, endedAt }).then((res) => {
      setBusy(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      endCouponLocally(res.data.couponId, res.data.endedAt);
      toast.success(t("ended", { code: coupon.code }));
    });
  }

  if (!board) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t("merchantTitle")}</h1>
          <p className="text-sm text-muted">{t("merchantSubtitle")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden />
          {t("newCoupon")}
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("statLive")}
          value={String(board.totals.live)}
          icon={Ticket}
          hint={t("statLiveHint", { count: board.rows.length })}
        />
        <StatCard
          label={t("statRedemptions")}
          value={String(board.totals.redemptions)}
          icon={BadgePercent}
        />
        <StatCard
          label={t("statDiscount")}
          value={formatPrice(board.totals.discountGiven, currency)}
          icon={Wallet}
        />
        <StatCard
          label={t("statRevenue")}
          value={formatPrice(board.totals.revenue, currency)}
          icon={TrendingUp}
          hint={t("statRevenueHint")}
        />
      </div>

      {board.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line bg-surface py-16 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
            <Ticket className="size-7" aria-hidden />
          </span>
          <p className="text-lg font-semibold text-ink">{t("merchantEmptyTitle")}</p>
          <p className="max-w-sm text-body">{t("merchantEmptyBody")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-panel border border-line bg-surface">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b border-line text-start text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{t("colCoupon")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("colStatus")}</th>
                <th className="px-4 py-3 text-end font-semibold">{t("colRedemptions")}</th>
                <th className="px-4 py-3 text-end font-semibold">{t("colDiscount")}</th>
                <th className="px-4 py-3 text-end font-semibold">{t("colRevenue")}</th>
                <th className="px-4 py-3 text-end font-semibold">
                  <span className="sr-only">{t("colActions")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {board.rows.map((row) => (
                <tr key={row.coupon.id}>
                  <td className="px-4 py-3">
                    <span className="block font-semibold text-ink">{row.coupon.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold tracking-wider text-primary">
                        {row.coupon.code}
                      </span>
                      <span className="text-xs text-muted">
                        {couponValueLabel(row.coupon, t)}
                        {row.coupon.minOrder > 0 &&
                          ` · ${t("minOrder", {
                            amount: formatPrice(row.coupon.minOrder, currency),
                          })}`}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-pill px-2.5 py-1 text-xs font-semibold",
                        row.status === "active"
                          ? "bg-fresh-50 text-fresh-600"
                          : row.status === "scheduled"
                            ? "bg-accent-50 text-accent-600"
                            : "bg-surface-muted text-muted",
                      )}
                    >
                      {row.status === "active" && row.daysLeft <= 3
                        ? t("expiresIn", { count: row.daysLeft })
                        : t(`status.${row.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end font-semibold text-ink">
                    {row.redemptions}
                  </td>
                  <td className="px-4 py-3 text-end text-body">
                    {formatPrice(row.discountGiven, currency)}
                  </td>
                  <td className="px-4 py-3 text-end text-body">
                    {formatPrice(row.revenue, currency)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {row.status !== "expired" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleEnd(row.coupon)}
                        className="text-xs font-semibold text-muted hover:text-danger disabled:opacity-50"
                      >
                        {t("endNow")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateCouponModal
          busy={busy}
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

/**
 * The issue form. It collects the rule only — validation (code format, code
 * uniqueness across the platform, sane percentages) belongs to the seam, so the
 * same rules would hold for any client.
 */
function CreateCouponModal({
  busy,
  onClose,
  onCreate,
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (input: NewVendorCoupon) => void;
}) {
  const t = useTranslations("coupons");
  const [form, setForm] = useState<NewVendorCoupon>({
    code: "",
    title: "",
    description: "",
    kind: "percentage",
    value: 10,
    maxDiscount: null,
    minOrder: 0,
    usageLimit: 1,
    durationDays: 14,
  });

  const patch = (next: Partial<NewVendorCoupon>) => setForm((f) => ({ ...f, ...next }));

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="create-coupon-title"
      className="max-h-[85vh] overflow-y-auto p-6"
    >
      <h2 id="create-coupon-title" className="text-h3 text-ink">
        {t("newCoupon")}
      </h2>
      <p className="mt-1 text-sm text-muted">{t("newCouponHint")}</p>

      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onCreate(form);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="coupon-code" label={t("fieldCode")}>
            {({ id }) => (
              <Input
                id={id}
                value={form.code}
                onChange={(e) => patch({ code: e.target.value })}
                placeholder="LUNCH15"
                className="uppercase"
              />
            )}
          </Field>
          <Field id="coupon-title" label={t("fieldTitle")}>
            {({ id }) => (
              <Input
                id={id}
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            )}
          </Field>
        </div>

        <Field id="coupon-desc" label={t("fieldDescription")}>
          {({ id }) => (
            <Input
              id={id}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          )}
        </Field>

        <div>
          <span className="mb-2 block text-sm font-semibold text-ink">{t("fieldKind")}</span>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => patch({ kind })}
                aria-pressed={form.kind === kind}
                className={cn(
                  "rounded-field border px-3 py-2 text-sm font-semibold transition-colors",
                  form.kind === kind
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-line text-body hover:bg-surface-muted",
                )}
              >
                {t(`kind.${kind}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {form.kind !== "free-delivery" && (
            <Field
              id="coupon-value"
              label={form.kind === "percentage" ? t("fieldPercent") : t("fieldAmount")}
            >
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={form.value}
                  onChange={(e) => patch({ value: Number(e.target.value) })}
                />
              )}
            </Field>
          )}
          {form.kind === "percentage" && (
            <Field id="coupon-max" label={t("fieldMaxDiscount")}>
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.maxDiscount ?? ""}
                  placeholder={t("fieldNoCap")}
                  onChange={(e) =>
                    patch({ maxDiscount: e.target.value ? Number(e.target.value) : null })
                  }
                />
              )}
            </Field>
          )}
          <Field id="coupon-min" label={t("fieldMinOrder")}>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                value={form.minOrder}
                onChange={(e) => patch({ minOrder: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field id="coupon-uses" label={t("fieldUsageLimit")}>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                value={form.usageLimit}
                onChange={(e) => patch({ usageLimit: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field id="coupon-days" label={t("fieldDuration")}>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                value={form.durationDays}
                onChange={(e) => patch({ durationDays: Number(e.target.value) })}
              />
            )}
          </Field>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" className="flex-1" disabled={busy}>
            {t("createCoupon")}
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
