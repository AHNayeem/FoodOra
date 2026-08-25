"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  BadgePercent,
  Inbox,
  Pause,
  Play,
  Plus,
  Search,
  Ticket,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import type {
  CampaignRow,
  CampaignSegment,
  CampaignSort,
  Coupon,
  CouponStatus,
} from "@/types";
import type { CampaignBoard, NewPlatformCampaign } from "@/services/coupons";
import {
  CAMPAIGN_KINDS,
  createPlatformCampaign,
  endCampaign,
  getPlatformCampaigns,
  setCampaignPaused,
} from "@/services/coupons";
import type { CurrencyCode } from "@/config/regions";
import { useCampaigns, useCampaignDesk } from "@/stores/campaigns";
import { couponValueLabel } from "@/components/coupons/coupon-ticket";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEGMENTS: readonly CampaignSegment[] = ["all", "live", "scheduled", "paused", "ended"];
const SORTS: readonly CampaignSort[] = ["newest", "endingSoon", "redemptions", "spend"];

/** Categories the create form offers. The slugs `lib/mock/categories` defines. */
const CATEGORY_SLUGS = [
  "pizza",
  "burgers",
  "sushi",
  "biryani",
  "pasta",
  "tacos",
  "coffee",
  "desserts",
  "healthy",
  "ramen",
] as const;

/**
 * AdminCampaigns — platform coupons and campaigns (Phase 12, G28).
 *
 * The gap this closes was not "there is no coupon engine" — C21 built one, and it
 * is untouched here. It was that **nobody could run a campaign**: the codes on
 * `/offers` were seed data, a restaurant could issue its own from
 * `/dashboard/coupons`, and the platform itself had no way to start one, stop one,
 * or find out what one had cost.
 *
 * Three things this screen holds to:
 *
 *  - **The engine is reused, not reimplemented.** Eligibility, validity, limits
 *    and money all come back from `services/coupons`, which prices campaigns with
 *    the same `lib/coupons.evaluateCoupon` the checkout picker uses. Nothing here
 *    decides what a code is worth.
 *  - **Restaurant codes are somebody else's.** The board's population is
 *    `isPlatformCampaign`; the merchant's book stays where it was. Vendor codes
 *    are counted in the footer so the desk knows they exist, and are not
 *    editable from here.
 *  - **Deactivating is reversible and ending is not**, so they are different
 *    controls: a pause is one tap either way, ending asks first. Both bite at
 *    checkout rather than only on this table — `pausedAt` is refused by the
 *    engine, which is what stops this from being an admin screen that changes
 *    nothing.
 */
export function AdminCampaigns() {
  const t = useTranslations("campaigns");
  const tc = useTranslations("coupons");
  const format = useFormatter();

  const hydrated = useCampaigns((s) => s.hydrated);
  const desk = useCampaignDesk();
  const addCampaign = useCampaigns((s) => s.addCampaign);
  const setPausedLocally = useCampaigns((s) => s.setPaused);
  const endLocally = useCampaigns((s) => s.endCampaign);

  const [board, setBoard] = useState<CampaignBoard | null>(null);
  const [segment, setSegment] = useState<CampaignSegment>("all");
  const [sort, setSort] = useState<CampaignSort>("newest");
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<CampaignRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void useCampaigns.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let live = true;
    getPlatformCampaigns(desk, { segment, sort, text }).then((next) => {
      if (live) setBoard(next);
    });
    return () => {
      live = false;
    };
  }, [desk, hydrated, segment, sort, text]);

  const currency = (board?.currency ?? "BDT") as CurrencyCode;

  function handleCreate(input: NewPlatformCampaign) {
    setBusy(true);
    createPlatformCampaign(input, desk, currency).then((res) => {
      setBusy(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      addCampaign(res.data);
      setCreating(false);
      toast.success(t("created", { code: res.data.code }));
    });
  }

  function handlePause(row: CampaignRow, paused: boolean) {
    setBusy(true);
    setCampaignPaused(row.coupon.id, paused, desk).then((res) => {
      setBusy(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      // The code travels with the id purely so the audit line names the campaign
      // rather than its key (Phase 15).
      setPausedLocally(res.data.couponId, res.data.pausedAt, row.coupon.code);
      toast.success(t(paused ? "paused" : "resumed", { code: row.coupon.code }));
    });
  }

  function handleEnd(row: CampaignRow) {
    setBusy(true);
    endCampaign(row.coupon.id, desk).then((res) => {
      setBusy(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      endLocally(res.data.couponId, res.data.endedAt, row.coupon.code);
      setEnding(null);
      toast.success(t("ended", { code: row.coupon.code }));
    });
  }

  if (!board) {
    return (
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-card bg-surface" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          {t("newCampaign")}
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("statLive")}
          value={String(board.totals.live)}
          icon={Ticket}
          hint={t("statLiveHint", { count: board.totals.campaigns })}
        />
        <StatCard
          label={t("statRedemptions")}
          value={String(board.totals.redemptions)}
          icon={BadgePercent}
          hint={t("statRedemptionsHint")}
        />
        <StatCard
          label={t("statDiscount")}
          value={formatPrice(board.totals.discountGiven, currency)}
          icon={Wallet}
          hint={t("statDiscountHint")}
        />
        <StatCard
          label={t("statRevenue")}
          value={formatPrice(board.totals.revenue, currency)}
          icon={TrendingUp}
          hint={t("statRevenueHint")}
        />
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="ps-10"
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {SEGMENTS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={segment === value}
              onClick={() => setSegment(value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors",
                segment === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-line text-body hover:bg-surface-muted",
              )}
            >
              {t(`segment.${value}`)}
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-pill px-1.5 text-xs font-bold tabular-nums",
                  segment === value
                    ? "bg-primary/15 text-primary"
                    : "bg-surface-muted text-muted",
                )}
              >
                {board.counts[value]}
              </span>
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
            {t("sortLabel")}
          </span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as CampaignSort)}
            className="h-11 rounded-field border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus-visible:border-primary"
          >
            {SORTS.map((value) => (
              <option key={value} value={value}>
                {t(`sort.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(text || segment !== "all") && (
        <button
          type="button"
          onClick={() => {
            setText("");
            setSegment("all");
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <X className="size-3.5" aria-hidden />
          {t("clear")}
        </button>
      )}

      {board.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
            <Inbox className="size-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink">{t("empty")}</p>
          <p className="max-w-sm text-xs text-muted">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[62rem] text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{t("colCampaign")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("colEligibility")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("colWindow")}</th>
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
                <CampaignTableRow
                  key={row.coupon.id}
                  row={row}
                  nowMs={board.nowMs}
                  currency={currency}
                  busy={busy}
                  format={format}
                  onPause={(paused) => handlePause(row, paused)}
                  onEnd={() => setEnding(row)}
                  t={t}
                  tc={tc}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The two populations the spec asks to keep apart, stated on the screen
          rather than only in the code that separates them. */}
      <p className="text-xs text-muted">
        {t("separationNote", {
          vendorCodes: board.totals.vendorCodes,
          grants: board.totals.grants,
        })}
      </p>

      {creating && (
        <CreateCampaignModal
          busy={busy}
          currency={currency}
          onClose={() => setCreating(false)}
          onCreate={handleCreate}
        />
      )}

      <ConfirmDialog
        open={ending !== null}
        title={t("endTitle")}
        body={ending ? t("endBody", { code: ending.coupon.code }) : undefined}
        confirmLabel={t("endConfirm")}
        tone="danger"
        submitting={busy}
        onClose={() => setEnding(null)}
        onConfirm={() => ending && handleEnd(ending)}
      />
    </div>
  );
}

const STATUS_TONE: Record<CouponStatus, string> = {
  active: "bg-fresh-50 text-fresh-600",
  scheduled: "bg-accent-50 text-accent-600",
  paused: "bg-surface-muted text-ink",
  used: "bg-surface-muted text-muted",
  expired: "bg-surface-muted text-muted",
};

/**
 * One campaign. The eligibility column is the phase's real content: a desk
 * pausing a code needs to see, without opening anything, who it applies to and
 * what it takes off — so scope, restriction, minimum, limit and first-order-only
 * are all read straight off the coupon rather than summarised into a label.
 */
function CampaignTableRow({
  row,
  nowMs,
  currency,
  busy,
  format,
  onPause,
  onEnd,
  t,
  tc,
}: {
  row: CampaignRow;
  nowMs: number;
  currency: CurrencyCode;
  busy: boolean;
  format: ReturnType<typeof useFormatter>;
  onPause: (paused: boolean) => void;
  onEnd: () => void;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  const { coupon, status } = row;
  const eligibility: string[] = [];
  if (row.vendors.length > 0) {
    eligibility.push(t("vendorsOnly", { vendors: row.vendors.map((v) => v.name).join(", ") }));
  }
  if (coupon.categorySlugs.length > 0) {
    eligibility.push(t("categoriesOnly", { categories: coupon.categorySlugs.join(", ") }));
  }
  if (eligibility.length === 0) eligibility.push(t("anywhere"));
  if (coupon.minOrder > 0) {
    eligibility.push(tc("minOrder", { amount: formatPrice(coupon.minOrder, currency) }));
  }
  if (coupon.firstOrderOnly) eligibility.push(t("firstOrderOnly"));
  eligibility.push(t("usageLimit", { count: coupon.usageLimit }));

  return (
    <tr className={cn(status === "paused" && "bg-surface-muted/60")}>
      <td className="px-4 py-3 align-top">
        <span className="block font-semibold text-ink">{coupon.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold tracking-wider text-primary">
            {coupon.code}
          </span>
          <span className="text-xs text-muted">{couponValueLabel(coupon, tc)}</span>
        </span>
      </td>

      <td className="px-4 py-3 align-top text-xs text-body">
        <ul className="space-y-0.5">
          {eligibility.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </td>

      <td className="px-4 py-3 align-top text-xs text-body">
        <span className="block">
          {format.dateTime(new Date(coupon.startsAt), { dateStyle: "medium" })}
        </span>
        <span className="block text-muted">
          {format.dateTime(new Date(coupon.endsAt), { dateStyle: "medium" })}
        </span>
      </td>

      <td className="px-4 py-3 align-top">
        <span
          className={cn(
            "inline-flex rounded-pill px-2.5 py-1 text-xs font-semibold",
            STATUS_TONE[status],
          )}
        >
          {status === "active" && row.daysLeft <= 3
            ? tc("expiresIn", { count: row.daysLeft })
            : tc(`status.${status}`)}
        </span>
        {status === "paused" && coupon.pausedAt && (
          <span className="mt-1 block text-[11px] text-muted">
            {t("pausedSince", {
              ago: format.relativeTime(new Date(coupon.pausedAt), nowMs),
            })}
          </span>
        )}
      </td>

      <td className="px-4 py-3 align-top text-end font-semibold text-ink tabular-nums">
        {row.redemptions}
      </td>
      <td className="px-4 py-3 align-top text-end text-body tabular-nums">
        {formatPrice(row.discountGiven, currency)}
      </td>
      <td className="px-4 py-3 align-top text-end text-body tabular-nums">
        {formatPrice(row.revenue, currency)}
      </td>

      <td className="px-4 py-3 align-top text-end">
        {status !== "expired" && (
          <div className="flex flex-col items-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onPause(status !== "paused")}
            >
              {status === "paused" ? (
                <>
                  <Play className="size-3.5" aria-hidden />
                  {t("activate")}
                </>
              ) : (
                <>
                  <Pause className="size-3.5" aria-hidden />
                  {t("deactivate")}
                </>
              )}
            </Button>
            <button
              type="button"
              disabled={busy}
              onClick={onEnd}
              className="text-xs font-semibold text-muted hover:text-danger disabled:opacity-50"
            >
              {t("endNow")}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * The campaign form. It collects the *rule* only — every constraint (code shape,
 * uniqueness across the whole catalogue, sane percentages, a window that starts
 * today or later) is checked by the seam, so an API client would be held to the
 * same ones.
 */
function CreateCampaignModal({
  busy,
  currency,
  onClose,
  onCreate,
}: {
  busy: boolean;
  currency: CurrencyCode;
  onClose: () => void;
  onCreate: (input: NewPlatformCampaign) => void;
}) {
  const t = useTranslations("campaigns");
  const tc = useTranslations("coupons");
  const [form, setForm] = useState<NewPlatformCampaign>({
    code: "",
    title: "",
    description: "",
    kind: "percentage",
    value: 15,
    maxDiscount: 300,
    minOrder: 500,
    usageLimit: 1,
    firstOrderOnly: false,
    startsInDays: 0,
    durationDays: 14,
    categorySlugs: [],
  });

  const patch = (next: Partial<NewPlatformCampaign>) => setForm((f) => ({ ...f, ...next }));
  const takesPercent = form.kind === "percentage" || form.kind === "cashback";
  const preview = useMemo(
    () =>
      couponValueLabel(
        {
          kind: form.kind,
          value: form.kind === "free-delivery" ? 0 : form.value,
          currency,
        } as Coupon,
        tc,
      ),
    [form.kind, form.value, currency, tc],
  );

  function toggleCategory(slug: string) {
    patch({
      categorySlugs: form.categorySlugs.includes(slug)
        ? form.categorySlugs.filter((s) => s !== slug)
        : [...form.categorySlugs, slug],
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="create-campaign-title"
      className="max-h-[85vh] overflow-y-auto p-6"
    >
      <h2 id="create-campaign-title" className="text-h3 text-ink">
        {t("newCampaign")}
      </h2>
      <p className="mt-1 text-sm text-muted">{t("newCampaignHint")}</p>

      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onCreate(form);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="campaign-code" label={t("fieldCode")} hint={t("fieldCodeHint")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={form.code}
                onChange={(e) => patch({ code: e.target.value })}
                placeholder="CTG25"
                className="uppercase"
              />
            )}
          </Field>
          <Field id="campaign-title" label={t("fieldTitle")}>
            {({ id }) => (
              <Input
                id={id}
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            )}
          </Field>
        </div>

        <Field id="campaign-desc" label={t("fieldDescription")}>
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CAMPAIGN_KINDS.map((kind) => (
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
          <p className="mt-1.5 text-xs text-muted">{t("valuePreview", { value: preview })}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {form.kind !== "free-delivery" && (
            <Field
              id="campaign-value"
              label={takesPercent ? t("fieldPercent") : t("fieldAmount")}
            >
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={takesPercent ? 100 : undefined}
                  value={form.value}
                  onChange={(e) => patch({ value: Number(e.target.value) })}
                />
              )}
            </Field>
          )}
          {takesPercent && (
            <Field id="campaign-cap" label={t("fieldMaxDiscount")}>
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={form.maxDiscount ?? ""}
                  placeholder={t("fieldNoCap")}
                  onChange={(e) =>
                    patch({ maxDiscount: e.target.value ? Number(e.target.value) : null })
                  }
                />
              )}
            </Field>
          )}
          <Field id="campaign-min" label={t("fieldMinOrder")}>
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
          <Field id="campaign-uses" label={t("fieldUsageLimit")} hint={t("fieldUsageLimitHint")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="numeric"
                min={1}
                value={form.usageLimit}
                onChange={(e) => patch({ usageLimit: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field id="campaign-start" label={t("fieldStart")} hint={t("fieldStartHint")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="numeric"
                min={0}
                value={form.startsInDays}
                onChange={(e) => patch({ startsInDays: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field id="campaign-days" label={t("fieldDuration")}>
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

        <fieldset>
          <legend className="mb-2 block text-sm font-semibold text-ink">
            {t("fieldCategories")}
          </legend>
          <p className="mb-2 text-xs text-muted">{t("fieldCategoriesHint")}</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_SLUGS.map((slug) => {
              const on = form.categorySlugs.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCategory(slug)}
                  className={cn(
                    "rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-line text-body hover:bg-surface-muted",
                  )}
                >
                  {slug}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="flex items-center gap-3 rounded-field border border-line p-3 text-sm">
          <input
            type="checkbox"
            checked={form.firstOrderOnly}
            onChange={(e) => patch({ firstOrderOnly: e.target.checked })}
            className="size-4 accent-primary"
          />
          <span>
            <span className="block font-semibold text-ink">{t("fieldFirstOrder")}</span>
            <span className="block text-xs text-muted">{t("fieldFirstOrderHint")}</span>
          </span>
        </label>

        <div className="flex gap-2 pt-2">
          <Button type="submit" className="flex-1" disabled={busy}>
            {t("createCampaign")}
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
