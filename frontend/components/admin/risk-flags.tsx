"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Customer, Order } from "@/types";
import { customerRisk, type CustomerRisk, type RiskLevel } from "@/lib/risk";
import { cn } from "@/lib/utils";

/**
 * RiskFlags — what the platform has noticed about an account (Phase 18, G44).
 *
 * Read, never stored. `lib/risk.customerRisk` derives every flag here from the
 * customer's own orders at render time, so a signal cannot outlive the pattern
 * that produced it: refund the fourth order and the flag appears, and it goes
 * again when those orders age past the window. A persisted score would have to be
 * kept in step by whatever remembered to, and would be wrong exactly when the
 * desk was reading it.
 *
 * Shown in two places and deliberately the same component in both: on the
 * customer's record, where it is context, and beside the refund controls on an
 * order, where it is the thing an agent needs to know *before* deciding. A flag
 * visible only in a directory nobody opens mid-decision is decoration.
 *
 * It never blocks anything. The two rules that refuse — the card attempt limit and
 * the courier cash ceiling — refuse at the point of action, and blocking an
 * account stays a moderator's decision with a reason and a log (Phase 11). What
 * this does is make the pattern sayable.
 */
export function RiskFlags({
  orders,
  customer = null,
  now,
  className,
  /** Render nothing when there is nothing to say (the order panel's default). */
  hideWhenClear = false,
}: {
  /** The customer's own orders — `lib/customers.ordersForCustomer`. */
  orders: Order[];
  customer?: Customer | null;
  now: number;
  className?: string;
  hideWhenClear?: boolean;
}) {
  const t = useTranslations("admin.risk");
  const risk = customerRisk(orders, customer, now);

  if (hideWhenClear && risk.signals.length === 0) return null;

  const tone = TONE[risk.level];
  const Icon = risk.level === "clear" ? ShieldCheck : risk.level === "watch" ? AlertTriangle : ShieldAlert;

  return (
    <section
      className={cn("rounded-card border p-4", tone.frame, className)}
      aria-label={t("title")}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-4 shrink-0", tone.icon)} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {t(`level.${risk.level}`)} · {t("window", { count: risk.window })}
          </p>

          {risk.signals.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {risk.signals.map((signal) => (
                <li key={signal.kind} className="flex items-baseline gap-2 text-xs">
                  <span
                    className={cn(
                      "mt-1 size-1.5 shrink-0 rounded-pill",
                      signal.level === "elevated" ? "bg-danger" : "bg-warning",
                    )}
                    aria-hidden
                  />
                  <span className="text-body">
                    {t(`signal.${signal.kind}`, { count: signal.count, of: signal.of })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* The one consequence a flag has on its own, said plainly rather than
              discovered at somebody's checkout. */}
          {heldLevels.includes(risk.level) && (
            <p className="mt-3 text-xs font-semibold text-danger">{t("couponHold")}</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Levels at which `lib/risk.couponHeld` holds the discount. */
const heldLevels: RiskLevel[] = ["elevated", "blocked"];

const TONE: Record<RiskLevel, { frame: string; icon: string }> = {
  clear: { frame: "border-line bg-surface", icon: "text-success" },
  watch: { frame: "border-warning/40 bg-warning/5", icon: "text-warning" },
  elevated: { frame: "border-danger/40 bg-danger/5", icon: "text-danger" },
  blocked: { frame: "border-danger/50 bg-danger/10", icon: "text-danger" },
};

export type { CustomerRisk };
