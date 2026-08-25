import type { AuditEntry, Customer, Order, VendorApplication } from "@/types";
import { actorFrom, buildAuditEntry } from "@/lib/audit";
import { userById } from "./users";

/**
 * audit.ts — what the platform trail looks like before this device does anything
 * (Phase 15, G32).
 *
 * The same argument `lib/mock/review-reports` makes: a log that is empty until the
 * reviewer clicks something teaches nobody what the screen is for, and the filter,
 * the actor list and the counts all have nothing behind them. So the seed lays
 * down a fortnight of plausible desk work.
 *
 * Two rules, both borrowed from the seeds that came before:
 *
 *  - **Entities are picked by rule, from the live working set.** Order ids are
 *    derived from the clock (`ord_demo_<i>_<t>`), so a hard-coded id would point at
 *    nothing on the second reload. `buildDemoAudit` is handed the orders the store
 *    actually holds — the way `buildDemoTickets` is — and asks for "a completed
 *    delivery" or "one that ended badly" rather than an index.
 *  - **Entries are built through the real constructor.** `buildAuditEntry` writes
 *    the descriptions and the ids, so a seeded line is indistinguishable in shape
 *    from one this device produces, and a change to the wording reaches both.
 *
 * The actors are the seeded desk accounts, which is the other half of what makes
 * the screen legible: the log shows a support agent deciding refunds, a finance
 * manager running payouts and the super-admin changing rights, so the actor filter
 * has something to filter and Phase 14's role table is visible as behaviour.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

const ADMIN = actorFrom(userById.get("usr_admin"));
const SUPPORT = actorFrom(userById.get("usr_support"));
const FINANCE = actorFrom(userById.get("usr_finance"));
const MARKETING = actorFrom(userById.get("usr_marketing"));

/**
 * Build the seeded trail.
 *
 * Pure and deterministic given its inputs. Anything it cannot find — no completed
 * order on a fresh device, no seeded application — is simply not recorded, rather
 * than recorded against a made-up id: an audit line naming an entity nobody can
 * open is worse than one line fewer.
 */
export function buildDemoAudit(
  orders: Order[],
  customers: Customer[],
  applications: VendorApplication[],
  now: number,
): AuditEntry[] {
  const entries: AuditEntry[] = [];
  const push = (
    at: number,
    actor: typeof ADMIN,
    input: Parameters<typeof buildAuditEntry>[0],
  ) => {
    entries.push(buildAuditEntry(input, actor, at));
  };

  const settled = orders.find((o) => o.status === "completed" && !o.deletedAt);
  const failed = orders.find(
    (o) => !o.deletedAt && ["cancelled", "rejected", "returned"].includes(o.status),
  );
  const blocked = customers.find((c) => c.blockedAt);
  const approved = applications.find((a) => a.status === "approved");

  // Two weeks ago: the platform admitted a restaurant.
  if (approved) {
    push(now - 13 * DAY, ADMIN, {
      action: "restaurant.decided",
      entity: "vendor-application",
      entityId: approved.id,
      metadata: {
        decision: "approved",
        name: approved.restaurant.name,
        reason: "Trade licence and food licence both verified.",
      },
    });
  }

  // A week ago: finance ran the weekly batch.
  push(now - 7 * DAY + 9 * HOUR, FINANCE, {
    action: "payout.run",
    entity: "payout-run",
    entityId: "run_vendor_weekly",
    metadata: { payee: "vendor", paid: 18, skipped: 2, amount: 412_900, currency: "BDT" },
  });

  // Marketing put a campaign out, then paused it when the budget ran hot.
  push(now - 5 * DAY, MARKETING, {
    action: "coupon.created",
    entity: "coupon",
    entityId: "cpn_platform_weekend",
    metadata: { code: "WEEKEND50", scope: "platform" },
  });
  push(now - 2 * DAY - 4 * HOUR, MARKETING, {
    action: "coupon.paused",
    entity: "coupon",
    entityId: "cpn_platform_weekend",
    metadata: { code: "WEEKEND50", reason: "Redemption rate above forecast." },
  });

  // Support handled a bad order: forced it closed, then gave the money back.
  if (failed) {
    push(now - 2 * DAY, SUPPORT, {
      action: "order.intervened",
      entity: "order",
      entityId: failed.id,
      metadata: { to: failed.status, reason: "Restaurant closed on arrival." },
    });
    push(now - 2 * DAY + HOUR, SUPPORT, {
      action: "refund.decided",
      entity: "order",
      entityId: failed.id,
      metadata: {
        decision: "approve",
        amount: failed.pricing.total,
        currency: failed.pricing.currency,
        reason: "Order never left the kitchen.",
      },
    });
  }

  // And blocked somebody who had been ordering to be refunded.
  if (blocked) {
    push(now - 36 * HOUR, SUPPORT, {
      action: "customer.blocked",
      entity: "customer",
      entityId: blocked.id,
      metadata: {
        name: blocked.name,
        reason: "abuse",
        note: "Nine refund claims in three weeks, all on delivered orders.",
      },
    });
  }

  // Yesterday: one vendor paid off-cycle, because they asked.
  if (settled) {
    push(now - 20 * HOUR, FINANCE, {
      action: "payout.paid",
      entity: "settlement",
      entityId: `set_${settled.vendor.id}_offcycle`,
      metadata: {
        name: settled.vendor.name,
        amount: 24_150,
        currency: settled.pricing.currency,
        periodRef: "off-cycle",
      },
    });
  }

  // This morning: the marketing account was given the content desk.
  push(now - 6 * HOUR, ADMIN, {
    action: "permission.changed",
    entity: "staff",
    entityId: "usr_marketing",
    metadata: { name: "Nayeem Hasan", change: "granted content.manage" },
  });

  return entries;
}
