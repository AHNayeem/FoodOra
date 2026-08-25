"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Banknote, Check, Loader2, X } from "lucide-react";
import type { Order } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useCan } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import {
  canDecideRefund,
  canSettleRefund,
  refundIsInstant,
  refundMethodFor,
} from "@/lib/order-machine";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ReadOnlyNotice } from "./read-only-notice";

/**
 * RefundControls — the refund lifecycle, as buttons (Phase 5, G07).
 *
 * `requested → approved | rejected → refunded`, and each step here is one call into
 * `stores/orders`, which is the only place the money moves. The component holds an
 * amount field and nothing else; whether a step is *possible* is asked of the domain
 * (`canDecideRefund`, `canSettleRefund`) rather than derived from the status, so it
 * cannot offer a decision the store would refuse.
 *
 * The settle step is deliberately visible even though a wallet refund never needs
 * it: seeing "approved — waiting for the provider" and having to mark it paid is the
 * honest shape of a card refund, and hiding it would put the prototype back where
 * Phase 5 found it, announcing money as returned the instant somebody agreed to it.
 */
export function RefundControls({
  order,
  className,
}: {
  order: Order;
  className?: string;
}) {
  const t = useTranslations("support");
  const ta = useTranslations("admin");
  const locale = useLocale();

  const decideRefund = useOrders((s) => s.decideRefund);
  const settleRefund = useOrders((s) => s.settleRefund);
  /**
   * Phase 14: a refund is its own right.
   *
   * `refunds.manage`, not `orders.manage` — deliberately separate, because giving
   * money back is the one admin action with a balance-sheet consequence and the
   * desks that may do it (support, finance) are not the desk that may move an
   * order along. The domain refuses it too; this only stops the click.
   */
  const mayRefund = useCan("refunds", "manage");

  const currency = order.pricing.currency as CurrencyCode;
  const [amount, setAmount] = useState<string>(() => String(order.pricing.total));
  const [submitting, setSubmitting] = useState(false);

  const canDecide = canDecideRefund(order);
  const canSettle = canSettleRefund(order);
  const method = order.lifecycle.refundMethod ?? refundMethodFor(order);

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  function decide(decision: "approve" | "reject") {
    const value = Number(amount);
    setSubmitting(true);
    const result = decideRefund(order.id, decision, {
      amount: Number.isFinite(value) ? value : undefined,
    });
    setSubmitting(false);
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    toast.success(t(decision === "approve" ? "refundApproved" : "refundRejected"));
  }

  function settle() {
    setSubmitting(true);
    const result = settleRefund(order.id);
    setSubmitting(false);
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    toast.success(t("refundSettled"));
  }

  return (
    <section
      className={cn(
        "rounded-card border border-line bg-surface p-4",
        className,
      )}
    >
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
        <Banknote className="size-4 text-muted" aria-hidden />
        {t("refundTitle")}
      </h2>

      <dl className="mt-3 space-y-1.5 text-sm">
        <Line label={t("refundState")} value={ta(`refundState.${order.lifecycle.refund}`)} />
        <Line label={t("refundRoute")} value={t(`refundMethod.${method}`)} />
        {order.lifecycle.refundAmount > 0 && (
          <Line
            label={t("refundAmount")}
            value={formatPrice(order.lifecycle.refundAmount, currency)}
          />
        )}
        {order.lifecycle.refundDecidedAt && (
          <Line
            label={t("refundDecidedAt")}
            value={fmtDateTime(order.lifecycle.refundDecidedAt)}
          />
        )}
        {order.lifecycle.refundSettledAt && (
          <Line
            label={t("refundSettledAt")}
            value={fmtDateTime(order.lifecycle.refundSettledAt)}
          />
        )}
      </dl>

      {canDecide && (
        <div className="mt-4 border-t border-line pt-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("refundAmountLabel", { max: formatPrice(order.pricing.total, currency) })}
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={order.pricing.total}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <p className="mt-1.5 text-xs text-muted">
            {t(refundIsInstant(method) ? "refundInstantHint" : "refundProviderHint")}
          </p>
          {!mayRefund && <ReadOnlyNotice permission="refunds.manage" className="mt-3" />}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={submitting || !mayRefund}
              onClick={() => decide("approve")}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4" aria-hidden />
              )}
              {t("refundApprove")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={submitting || !mayRefund}
              onClick={() => decide("reject")}
            >
              <X className="size-4" aria-hidden />
              {t("refundReject")}
            </Button>
          </div>
        </div>
      )}

      {canSettle && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs text-muted">{t("refundAwaitingSettlement")}</p>
          <Button
            size="sm"
            className="mt-2"
            disabled={submitting || !mayRefund}
            onClick={settle}
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("refundMarkSettled")}
          </Button>
        </div>
      )}

      {!canDecide && !canSettle && (
        <p className="mt-3 rounded-field bg-surface-muted p-2.5 text-xs text-muted">
          {order.lifecycle.refund === "refunded"
            ? t("refundDone")
            : order.lifecycle.refund === "rejected"
              ? t("refundRefused")
              : t("refundNothingToDo")}
        </p>
      )}
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}
