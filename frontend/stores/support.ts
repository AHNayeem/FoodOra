"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Order,
  SupportCategory,
  SupportEvent,
  SupportOutcome,
  SupportTicket,
  SupportTicketStatus,
} from "@/types";
import { buildDemoTickets } from "@/lib/mock/support-tickets";
import { supportNotifications } from "@/lib/notifications";
import {
  addMessage,
  createTicket,
  isTicketLive,
  moveTicket,
  reopenTicket,
  resolveTicket,
  type TicketError,
} from "@/lib/support";
import { emitNotifications } from "./notifications";
import { useOrders } from "./orders";

/**
 * support store — every dispute, on both surfaces (Phase 5, G25/G26).
 *
 * The customer's ticket list and the operations desk's queue are the *same* rows,
 * for the same reason the four order surfaces share one order store: a support
 * conversation with two copies is not a conversation. An agent's reply appears in
 * the customer's thread because both are reading this store.
 *
 * Three rules, mirroring `stores/orders`:
 *
 *  1. **Every mutation goes through `lib/support`.** The graph refuses an illegal
 *     move and each change appends an event; nothing here writes `status` directly.
 *  2. **Every committed change emits notifications**, through the same routing gate
 *     as the order lifecycle — so a new kind of ticket event cannot ship without
 *     somebody deciding who hears about it. An internal note deliberately produces
 *     nothing (`supportNotifications` drops it).
 *  3. **The money is not here.** A refund decision recorded on a ticket is
 *     *applied* to the order, through `stores/orders.decideRefund`, so there is one
 *     record of whether a customer was paid. `resolve` below is the seam that keeps
 *     those two halves in step, which is why a component never calls both.
 */

const STORE_VERSION = 1;

interface SupportState {
  tickets: SupportTicket[];
  hydrated: boolean;
  seeded: boolean;

  // -- reads -------------------------------------------------------------
  getById: (id: string) => SupportTicket | undefined;

  // -- writes ------------------------------------------------------------
  /** The customer reporting a problem with an order. */
  openTicket: (input: {
    order: Order;
    category: SupportCategory;
    message: string;
    reportedBy: string;
  }) => SupportTicket;
  /** A reply from either side. `visibility: "internal"` makes it a desk note. */
  reply: (
    id: string,
    input: {
      author: SupportEvent["author"];
      authorName: string;
      body: string;
      visibility?: SupportEvent["visibility"];
    },
  ) => { ticket: SupportTicket | null; error: TicketError | null };
  /** Move a ticket without deciding it — picking it up, or parking it. */
  move: (
    id: string,
    to: SupportTicketStatus,
    by: { author: SupportEvent["author"]; authorName: string; note?: string | null },
  ) => { ticket: SupportTicket | null; error: TicketError | null };
  /**
   * Decide a ticket, and apply the refund that decision implies. One action
   * rather than two calls from a component — see the note on the store.
   */
  resolve: (
    id: string,
    input: { outcome: SupportOutcome; note: string; refundAmount?: number; by: string },
  ) => { ticket: SupportTicket | null; error: TicketError | string | null };
  /** Put a decided or filed ticket back on the desk. */
  reopen: (
    id: string,
    by: { author: SupportEvent["author"]; authorName: string; note?: string | null },
  ) => { ticket: SupportTicket | null; error: TicketError | null };

  // -- lifecycle ---------------------------------------------------------
  seed: (now?: number) => void;
  resetDemo: (now?: number) => void;
  setHydrated: () => void;
}

export const useSupport = create<SupportState>()(
  persist(
    (set, get) => ({
      tickets: [],
      hydrated: false,
      seeded: false,

      getById: (id) => get().tickets.find((t) => t.id === id),

      openTicket: ({ order, category, message, reportedBy }) => {
        const existing = get().tickets.find(
          (t) => t.orderId === order.id && isTicketLive(t.status),
        );
        // One live ticket per order. A customer reporting a second problem on the
        // same order is continuing the same conversation, not starting a queue of
        // them — and the desk should not have to work out that two rows are one
        // complaint.
        if (existing) {
          const replied = get().reply(existing.id, {
            author: "customer",
            authorName: reportedBy || order.contact.name,
            body: message,
          });
          return replied.ticket ?? existing;
        }

        const ticket = createTicket({ order, category, message, reportedBy });
        set((s) => ({ tickets: [ticket, ...s.tickets] }));
        const opening = ticket.events[0];
        if (opening) emitNotifications(supportNotifications(ticket, opening));
        return ticket;
      },

      reply: (id, input) => {
        const current = get().tickets.find((t) => t.id === id);
        if (!current) return { ticket: null, error: "errors.ticketNotFound" };
        const next = addMessage(current, input);
        set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? next : t)) }));
        const added = next.events[next.events.length - 1];
        if (added) emitNotifications(supportNotifications(next, added));
        return { ticket: next, error: null };
      },

      move: (id, to, by) => {
        const current = get().tickets.find((t) => t.id === id);
        if (!current) return { ticket: null, error: "errors.ticketNotFound" };
        const result = moveTicket(current, to, by);
        if (result.error) return { ticket: null, error: result.error };
        set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? result.ticket : t)) }));
        const moved = result.ticket.events[result.ticket.events.length - 1];
        if (moved) emitNotifications(supportNotifications(result.ticket, moved));
        return { ticket: result.ticket, error: null };
      },

      /**
       * Deciding a ticket and refunding an order are one operation from the desk's
       * point of view, so they are one action here.
       *
       * The order is written *first*, and its answer is what the ticket records: if
       * the refund is refused by the order's own guards (it was already paid back,
       * there was never any money to return) the ticket is not allowed to claim a
       * refund happened. That ordering is the whole reason this lives in the store
       * rather than in the admin component.
       */
      resolve: (id, input) => {
        const current = get().tickets.find((t) => t.id === id);
        if (!current) return { ticket: null, error: "errors.ticketNotFound" };

        const orders = useOrders.getState();
        let refundAmount = 0;

        if (input.outcome === "refused") {
          // Only refuse a refund that is actually open; a ticket can be refused
          // without any money ever having been in question.
          const order = orders.getById(current.orderId);
          if (order && order.lifecycle.refund === "requested") {
            orders.decideRefund(current.orderId, "reject");
          }
        } else if ((input.refundAmount ?? 0) > 0) {
          const applied = orders.decideRefund(current.orderId, "approve", {
            amount: input.refundAmount,
          });
          if (applied.error || !applied.order) {
            return { ticket: null, error: applied.error ?? "errors.refundNotOpen" };
          }
          refundAmount = applied.order.lifecycle.refundAmount;
        }

        const result = resolveTicket(current, { ...input, refundAmount });
        if (result.error) return { ticket: null, error: result.error };
        set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? result.ticket : t)) }));
        const decided = result.ticket.events[result.ticket.events.length - 1];
        if (decided) emitNotifications(supportNotifications(result.ticket, decided));
        return { ticket: result.ticket, error: null };
      },

      reopen: (id, by) => {
        const current = get().tickets.find((t) => t.id === id);
        if (!current) return { ticket: null, error: "errors.ticketNotFound" };
        const result = reopenTicket(current, by);
        if (result.error) return { ticket: null, error: result.error };
        set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? result.ticket : t)) }));
        return { ticket: result.ticket, error: null };
      },

      seed: (now = Date.now()) => {
        if (get().seeded) return;
        // Seeded against the *orders* that exist on this device, so a demo ticket
        // always opens onto a real order rather than a dangling reference.
        const demo = buildDemoTickets(useOrders.getState().orders, now);
        set((s) => {
          const known = new Set(s.tickets.map((t) => t.id));
          return {
            tickets: [...s.tickets, ...demo.filter((t) => !known.has(t.id))],
            seeded: true,
          };
        });
      },

      resetDemo: (now = Date.now()) =>
        set({ tickets: buildDemoTickets(useOrders.getState().orders, now), seeded: true }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-support",
      version: STORE_VERSION,
      partialize: (s) => ({ tickets: s.tickets, seeded: s.seeded }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        state?.seed();
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors — shared by the customer's list and the desk's queue
// ---------------------------------------------------------------------------

/** Every ticket about one order, newest first. */
export function ticketsForOrder(tickets: SupportTicket[], orderId: string): SupportTicket[] {
  return tickets
    .filter((t) => t.orderId === orderId && !t.deletedAt)
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
}

/** Is there an open conversation about this order? Drives the report button. */
export function liveTicketForOrder(
  tickets: SupportTicket[],
  orderId: string,
): SupportTicket | null {
  return tickets.find((t) => t.orderId === orderId && isTicketLive(t.status)) ?? null;
}

/** The customer's own list, newest first. */
export function customerTickets(tickets: SupportTicket[]): SupportTicket[] {
  return [...tickets]
    .filter((t) => !t.deletedAt)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/**
 * The desk's queue: live tickets first and oldest-first within that, then
 * everything decided, newest first.
 *
 * Two orderings in one list on purpose. The live part is *work* and is worked from
 * the top, so the ticket that has waited longest is the one you see; the decided
 * part is *history* and is read newest-first like every other log.
 */
export function supportQueue(tickets: SupportTicket[]): SupportTicket[] {
  const live = tickets.filter((t) => !t.deletedAt && isTicketLive(t.status));
  const done = tickets.filter((t) => !t.deletedAt && !isTicketLive(t.status));
  live.sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
  done.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return [...live, ...done];
}

/** How many tickets are waiting on the desk — the nav badge. */
export function liveTicketCount(tickets: SupportTicket[]): number {
  return tickets.filter((t) => !t.deletedAt && isTicketLive(t.status)).length;
}
