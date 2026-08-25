"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  BadgeCheck,
  Banknote,
  LifeBuoy,
  Loader2,
  PackageX,
  ShoppingBag,
  StickyNote,
  UserCheck,
  Users,
} from "lucide-react";
import type {
  CustomerBlockReason,
  CustomerModerationEvent,
  Order,
  SupportTicket,
} from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useAuth, useCan } from "@/stores/auth";
import { useCustomers } from "@/stores/customers";
import { useOrders } from "@/stores/orders";
import { useSupport } from "@/stores/support";
import {
  CUSTOMER_BLOCK_REASONS,
  MIN_MODERATION_NOTE,
  buildDirectory,
  customerInitials,
  findCustomerRecord,
  ordersForCustomer,
  ticketsForCustomer,
} from "@/lib/customers";
import { formatPrice, formatRating } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatCard } from "@/components/dashboard/stat-card";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { TicketStatusChip } from "@/components/account/support-view";
import { ReadOnlyNotice } from "./read-only-notice";
import { RiskFlags } from "./risk-flags";
import { cn } from "@/lib/utils";

/** Which dialog is open. `null` is the resting state. */
type Pending = "block" | "unblock" | "note";

/**
 * AdminCustomerDetail — one person, and everything the platform knows about them
 * (Phase 11, G15).
 *
 * Everything on this page except the account panel and the moderation log is
 * *derived* from the shared order and ticket stores at render time — the order
 * history is the same rows `/admin/orders` lists and the disputes are the same rows
 * the support desk works, joined on the customer's phone (`lib/customers`). There is
 * no second copy of an order here and no cached total, which is the point: the
 * spending summary a moderator blocks somebody over has to be the same money the
 * platform settles (§5.4).
 *
 * The two write paths are deliberately asymmetric. Blocking demands grounds *and* a
 * written reason, because the sentence is what the person is owed when they appeal;
 * unblocking asks only for confirmation, because a reinstatement that is hard to
 * perform is a reinstatement that quietly does not happen.
 */
export function AdminCustomerDetail({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const ts = useTranslations("support");
  const format = useFormatter();

  const hydrated = useCustomers((s) => s.hydrated);
  const ordersHydrated = useOrders((s) => s.hydrated);
  const accounts = useCustomers((s) => s.accounts);
  const orders = useOrders((s) => s.orders);
  const tickets = useSupport((s) => s.tickets);
  const block = useCustomers((s) => s.block);
  const unblock = useCustomers((s) => s.unblock);
  const addNote = useCustomers((s) => s.addNote);

  const moderator = useAuth((s) => s.user);
  /** Phase 14: reading the directory and acting on an account are separate rights. */
  const mayManage = useCan("customers", "manage");
  const moderatorName = moderator?.name ?? "Platform desk";

  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState<CustomerBlockReason | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    useOrders.persist.rehydrate();
    useSupport.persist.rehydrate();
    useCustomers.persist.rehydrate();
    useAuth.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const record = useMemo(
    () => findCustomerRecord(buildDirectory(accounts, orders, tickets), customerId),
    [accounts, orders, tickets, customerId],
  );
  const phone = record?.customer.phone ?? "";
  const ownOrders = useMemo(() => ordersForCustomer(orders, phone), [orders, phone]);
  const ownTickets = useMemo(() => ticketsForCustomer(tickets, phone), [tickets, phone]);

  function close() {
    setPending(null);
    setReason(null);
    setNote("");
    setSubmitting(false);
  }

  /** Run one moderation action, report what the domain said, and close up. */
  function commit(action: Pending) {
    if (!record) return;
    setSubmitting(true);
    const name = record.customer.name;
    const result =
      action === "block"
        ? block(customerId, { reason: reason!, note, by: moderatorName })
        : action === "unblock"
          ? unblock(customerId, { note, by: moderatorName })
          : addNote(customerId, { body: note, by: moderatorName });

    if (result.error) {
      setSubmitting(false);
      toast.error(t(result.error));
      return;
    }
    toast.success(
      action === "block"
        ? t("toastBlocked", { name })
        : action === "unblock"
          ? t("toastUnblocked", { name })
          : t("toastNoted"),
    );
    close();
  }

  if (!hydrated || !ordersHydrated) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-pill bg-surface" />
        <div className="h-96 animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
          <PackageX className="size-6" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-ink">{t("notFound")}</p>
        <Button href="/admin/customers" variant="outline" size="sm">
          {t("back")}
        </Button>
      </div>
    );
  }

  const { customer, stats } = record;
  const currency = stats.currency as CurrencyCode;
  const blocked = customer.status === "blocked";

  return (
    <div className="space-y-5">
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("back")}
      </Link>

      {/* Identity and the two controls that change anything. */}
      <header className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface p-4">
        <span
          aria-hidden
          className="inline-flex size-14 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-lg font-bold text-body"
        >
          {customerInitials(customer.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h3 text-ink">{customer.name}</h1>
            {blocked ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-danger/10 px-2.5 py-1 text-xs font-bold text-danger">
                <Ban className="size-3.5" aria-hidden />
                {t("chipBlocked")}
              </span>
            ) : customer.isVerified ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-fresh-50 px-2.5 py-1 text-xs font-semibold text-fresh-600">
                <BadgeCheck className="size-3.5" aria-hidden />
                {t("chipVerified")}
              </span>
            ) : (
              <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted">
                {t("chipUnverified")}
              </span>
            )}
            {!customer.userId && (
              <span className="rounded-pill border border-line px-2.5 py-1 text-xs font-semibold text-muted">
                {t("chipGuest")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            <span dir="ltr">{customer.phone}</span>
            {customer.email && <> · {customer.email}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!mayManage}
            onClick={() => setPending("note")}
          >
            <StickyNote className="size-4" aria-hidden />
            {t("action.note")}
          </Button>
          {blocked ? (
            <Button size="sm" disabled={!mayManage} onClick={() => setPending("unblock")}>
              <UserCheck className="size-4" aria-hidden />
              {t("action.unblock")}
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              disabled={!mayManage}
              onClick={() => setPending("block")}
            >
              <Ban className="size-4" aria-hidden />
              {t("action.block")}
            </Button>
          )}
        </div>
      </header>

      {/* Phase 14: `customers.view` opened this page; blocking somebody is
          `customers.manage`, which a moderator does not hold. */}
      {!mayManage && <ReadOnlyNotice permission="customers.manage" />}

      {blocked && customer.blockedAt && (
        <div className="rounded-card border border-danger/30 bg-danger/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-danger">
            <Ban className="size-4" aria-hidden />
            {t("blockedTitle")}
          </p>
          <p className="mt-1 text-sm text-body">
            {t("blockedBody", {
              reason: customer.blockReason ? t(`reason.${customer.blockReason}`) : "—",
              by: customer.blockedBy ?? "—",
              ago: format.relativeTime(new Date(customer.blockedAt), now),
            })}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("statOrders")}
          value={String(stats.orders)}
          icon={ShoppingBag}
          hint={t("statOrdersHint", { count: stats.live })}
        />
        <StatCard
          label={t("statNet")}
          value={formatPrice(stats.netSpend, currency)}
          icon={Banknote}
          hint={t("statNetHint")}
        />
        <StatCard
          label={t("statAverage")}
          value={formatPrice(stats.avgOrderValue, currency)}
          icon={Users}
          hint={t("statAverageHint", { count: stats.completed + stats.refundedOrders })}
        />
        <StatCard
          label={t("statRefunds")}
          value={formatPrice(stats.refunded, currency)}
          icon={LifeBuoy}
          hint={t("statRefundsHint", { count: stats.refundedOrders })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel
            title={t("panelOrders")}
            hint={t("ordersHint", { count: stats.orders })}
          >
            {ownOrders.length === 0 ? (
              <Empty title={t("ordersEmpty")} hint={t("ordersEmptyHint")} />
            ) : (
              <ul className="divide-y divide-line">
                {ownOrders.map((order) => (
                  <OrderRow key={order.id} order={order} now={now} format={format} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("panelTickets")}>
            {ownTickets.length === 0 ? (
              <Empty title={t("ticketsEmpty")} />
            ) : (
              <ul className="divide-y divide-line">
                {ownTickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    now={now}
                    format={format}
                    categoryLabel={ts(`category.${ticket.category}`)}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("panelLog")}>
            {customer.moderation.length === 0 ? (
              <Empty title={t("logEmpty")} />
            ) : (
              <ol className="space-y-3">
                {[...customer.moderation]
                  .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
                  .map((event) => (
                    <ModerationRow
                      key={event.id}
                      event={event}
                      now={now}
                      format={format}
                    />
                  ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          {/* What the platform has noticed, above the profile rather than below
              the spending table: it is the first thing a moderator opening this
              record needs and the last thing they would scroll for (G44). */}
          <RiskFlags orders={ownOrders} customer={customer} now={now} />

          <Panel title={t("panelAccount")} hint={customer.id} monoHint>
            <Facts
              rows={[
                [t("fieldStatus"), blocked ? t("statusBlocked") : t("statusActive")],
                [
                  t("fieldVerification"),
                  customer.isVerified ? t("chipVerified") : t("chipUnverified"),
                ],
                [t("fieldPhone"), customer.phone],
                [t("fieldEmail"), customer.email ?? t("noEmail")],
                [
                  t("fieldAccount"),
                  customer.userId && customer.email
                    ? t("accountLinked", { email: customer.email })
                    : t("noAccount"),
                ],
                [t("fieldCity"), customer.city ?? t("none")],
                [
                  t("fieldJoined"),
                  customer.joinedAt
                    ? format.dateTime(new Date(customer.joinedAt), {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : t("none"),
                ],
              ]}
            />
            {!customer.userId && (
              <p className="mt-3 text-xs text-muted">{t("derivedHint")}</p>
            )}
          </Panel>

          <Panel title={t("panelSpending")}>
            <Facts
              rows={[
                [t("spendGross"), formatPrice(stats.grossSpend, currency)],
                [t("spendRefunded"), formatPrice(stats.refunded, currency)],
                [t("spendNet"), formatPrice(stats.netSpend, currency)],
                [t("spendCompleted"), String(stats.completed)],
                [t("spendCancelled"), String(stats.cancelled)],
                [t("spendLive"), String(stats.live)],
                [t("spendCash"), String(stats.cashOrders)],
                [
                  t("spendFirst"),
                  stats.firstOrderAt
                    ? format.dateTime(new Date(stats.firstOrderAt), {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : t("none"),
                ],
                [
                  t("fieldFavourite"),
                  stats.favouriteVendor
                    ? `${stats.favouriteVendor.name} (${stats.favouriteVendor.orders})`
                    : t("none"),
                ],
                [t("fieldLastArea"), stats.lastArea ?? t("none")],
                [
                  t("fieldRating"),
                  stats.avgRating == null ? t("none") : formatRating(stats.avgRating),
                ],
              ]}
            />
          </Panel>
        </div>
      </div>

      {/* Block — grounds and a written reason, because that is what an appeal
          gets answered from. The domain refuses a short note as well; the
          disabled button is a courtesy, not the rule. */}
      <Modal
        open={pending === "block"}
        onClose={close}
        labelledBy="block-title"
        className="sm:max-w-md"
      >
        <div className="p-5 sm:p-6">
          <h2 id="block-title" className="text-h3 text-ink">
            {t("blockTitle", { name: customer.name })}
          </h2>
          <p className="mt-1 text-sm text-body">{t("blockBody")}</p>

          <fieldset className="mt-4">
            <legend className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("blockReasonLabel")}
            </legend>
            <div className="space-y-1.5">
              {CUSTOMER_BLOCK_REASONS.map((value) => {
                const selected = reason === value;
                return (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-field border p-2.5 text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary/5 font-semibold text-ink"
                        : "border-line text-body hover:bg-surface-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="block-reason"
                      value={value}
                      checked={selected}
                      onChange={() => setReason(value)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    {t(`reason.${value}`)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("blockNoteLabel")}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 400))}
              rows={4}
              placeholder={t("blockNotePlaceholder")}
              className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
          <p className="mt-1 text-xs text-muted">
            {t("blockNoteHint", { count: MIN_MODERATION_NOTE })}
          </p>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="md" className="flex-1" onClick={close}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              size="md"
              className="flex-1"
              disabled={!reason || note.trim().length < MIN_MODERATION_NOTE || submitting}
              onClick={() => commit("block")}
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("blockConfirm")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Unblock — confirmation and an optional note. Reinstating somebody should
          not be harder than stopping them. */}
      <Modal
        open={pending === "unblock"}
        onClose={close}
        labelledBy="unblock-title"
        className="sm:max-w-sm"
      >
        <div className="p-5 sm:p-6">
          <h2 id="unblock-title" className="text-h3 text-ink">
            {t("unblockTitle", { name: customer.name })}
          </h2>
          <p className="mt-1 text-sm text-body">{t("unblockBody")}</p>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("unblockNoteLabel")}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 400))}
              rows={3}
              placeholder={t("unblockNotePlaceholder")}
              className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="md" className="flex-1" onClick={close}>
              {t("cancel")}
            </Button>
            <Button
              size="md"
              className="flex-1"
              disabled={submitting}
              onClick={() => commit("unblock")}
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("unblockConfirm")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* A note changes nothing, which is exactly why it is worth having. */}
      <Modal
        open={pending === "note"}
        onClose={close}
        labelledBy="note-title"
        className="sm:max-w-md"
      >
        <div className="p-5 sm:p-6">
          <h2 id="note-title" className="text-h3 text-ink">
            {t("noteTitle")}
          </h2>
          <p className="mt-1 text-sm text-body">{t("noteBody")}</p>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("noteLabel")}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 400))}
              rows={4}
              placeholder={t("notePlaceholder")}
              className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="md" className="flex-1" onClick={close}>
              {t("cancel")}
            </Button>
            <Button
              size="md"
              className="flex-1"
              disabled={note.trim().length < MIN_MODERATION_NOTE || submitting}
              onClick={() => commit("note")}
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("noteConfirm")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows and layout — the same primitives the other admin detail pages use
// ---------------------------------------------------------------------------

function OrderRow({
  order,
  now,
  format,
}: {
  order: Order;
  now: number;
  format: ReturnType<typeof useFormatter>;
}) {
  return (
    <li>
      <Link
        href={`/admin/orders/${order.id}`}
        className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field px-2 py-2.5 transition-colors hover:bg-surface-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-ink">
              {order.orderNumber}
            </span>
            <OrderStatusChip status={order.status} size="sm" />
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {order.vendor.name} · {format.relativeTime(new Date(order.placedAt), now)}
          </span>
        </span>
        <span className="text-sm font-bold text-ink tabular-nums">
          {formatPrice(order.pricing.total, order.pricing.currency as CurrencyCode)}
        </span>
      </Link>
    </li>
  );
}

function TicketRow({
  ticket,
  now,
  format,
  categoryLabel,
}: {
  ticket: SupportTicket;
  now: number;
  format: ReturnType<typeof useFormatter>;
  categoryLabel: string;
}) {
  return (
    <li>
      <Link
        href={`/admin/support/${ticket.id}`}
        className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field px-2 py-2.5 transition-colors hover:bg-surface-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-ink">
              {ticket.ticketNumber}
            </span>
            <TicketStatusChip status={ticket.status} />
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {categoryLabel} · {ticket.orderNumber} ·{" "}
            {format.relativeTime(new Date(ticket.submittedAt), now)}
          </span>
        </span>
        {(ticket.resolution?.refundAmount ?? 0) > 0 && (
          <span className="text-sm font-bold text-primary tabular-nums">
            {formatPrice(
              ticket.resolution!.refundAmount,
              ticket.currency as CurrencyCode,
            )}
          </span>
        )}
      </Link>
    </li>
  );
}

function ModerationRow({
  event,
  now,
  format,
}: {
  event: CustomerModerationEvent;
  now: number;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations("customers");
  return (
    <li className="border-s-2 border-line ps-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
        <span
          className={cn(
            "rounded-pill px-2 py-0.5 text-[11px] font-bold",
            event.action === "block"
              ? "bg-danger/10 text-danger"
              : event.action === "unblock"
                ? "bg-fresh-50 text-fresh-600"
                : "bg-surface-muted text-body",
          )}
        >
          {t(`logAction.${event.action}`)}
        </span>
        {event.reason && (
          <span className="text-xs font-semibold text-muted">
            {t(`reason.${event.reason}`)}
          </span>
        )}
      </p>
      {event.body && <p className="mt-1 text-sm text-body">{event.body}</p>}
      <p className="mt-0.5 text-xs text-muted">
        {t("logBy", {
          by: event.by,
          ago: format.relativeTime(new Date(event.at), now),
        })}
      </p>
    </li>
  );
}

function Panel({
  title,
  hint,
  /** A reference to be read character by character, rather than a sentence. */
  monoHint = false,
  children,
}: {
  title: string;
  hint?: string;
  monoHint?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {hint && (
          <span className={cn("text-xs text-muted", monoHint && "font-mono")}>{hint}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-1">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">
            {label}
          </dt>
          <dd className="truncate text-sm text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-field border border-dashed border-line py-8 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
