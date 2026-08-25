import type { Order, OrderEvent, OrderEventDetail } from "@/types";

/**
 * order-events.ts — the typed event payload and the reader for the old one
 * (Phase 18, G45).
 *
 * `OrderEvent.detail` replaced `OrderEvent.note`, and that was a change to a
 * *persisted* shape: every device that has run this prototype since Phase 1 has
 * a store full of `"delay:15"` strings. So the phase's real work is not the
 * union — it is this module, which knows how to read the encoding that is being
 * retired, once, in one place, so the migration and nothing else has to.
 *
 * `lib/order-machine` mints details as it records events; `ensureEventDetails`
 * (in `lib/order-lifecycle`, beside its sibling backfills) converts an old
 * order's log by calling `eventDetailFromNote` here.
 *
 * Kept out of the machine so the machine keeps its single subject — transitions
 * — and so the parser can be deleted outright once no device carries a v6 store,
 * which is the point of putting it on its own.
 */

/** The old encoded shape, as it was persisted. Only this module reads it. */
interface LegacyEvent extends Omit<OrderEvent, "detail"> {
  detail?: OrderEventDetail | null;
  note?: string | null;
}

/**
 * Read one legacy `note` back into a typed detail.
 *
 * The vocabulary is closed and known — ten notes across four modules, listed in
 * the phase's handover — so every one of them has a case here. Anything else was
 * free prose somebody typed, and prose survives as prose rather than being
 * discarded: a cancellation whose reason was written out by an agent is the one
 * kind of note nobody can reconstruct later.
 *
 * `amount` on the refund members is left null on purpose. The sum is on the
 * order (`lifecycle.refundAmount`), the *event* never carried it, and
 * `ensureEventDetails` fills it from the order where the order can still answer.
 */
export function eventDetailFromNote(note: string | null | undefined): OrderEventDetail | null {
  if (!note) return null;
  const [kind, value] = note.split(":");
  const count = Number(value);
  switch (kind) {
    case "delay":
      return Number.isFinite(count) ? { kind: "delay", minutes: count } : null;
    case "otp-failed":
      return Number.isFinite(count) ? { kind: "otp-failed", attempts: count } : null;
    case "handover-failed":
      return Number.isFinite(count) ? { kind: "handover-failed", attempts: count } : null;
    case "rating":
      return Number.isFinite(count) ? { kind: "rating", score: count } : null;
    case "refund-requested":
      return { kind: "refund-requested", amount: null };
    case "refund-approved":
      return { kind: "refund-approved", amount: null };
    case "refund-rejected":
      return { kind: "refund-rejected" };
    case "refund-settled":
      return { kind: "refund-settled", amount: null };
    case "reassigned":
      return { kind: "reassigned", fromRider: null };
    case "scheduled-release":
      return { kind: "scheduled-release" };
    default:
      return { kind: "note", body: note };
  }
}

/**
 * Convert one persisted event. Idempotent, and deliberately conservative: an
 * event that already carries a detail is returned untouched even if a stale
 * `note` is sitting beside it, because the detail is the newer fact.
 *
 * `order` is passed so a refund event can borrow the figure the order does
 * record. It is the right sum for the common case (one refund per order) and it
 * is null-safe: an order whose refund was refused carries `refundAmount: 0`, and
 * a zero there means "nothing was owed", which is what the event said too.
 */
export function eventWithDetail(order: Order, event: LegacyEvent): OrderEvent {
  // Already migrated — returned by identity, not rebuilt, so a store that has
  // nothing to convert keeps the array it had and the selectors over it do not
  // re-run on every hydration.
  if (event.detail !== undefined && event.note === undefined) return event as OrderEvent;
  const { note, ...rest } = event;
  const detail = eventDetailFromNote(note);
  return {
    ...rest,
    detail: detail && "amount" in detail ? { ...detail, amount: refundFigure(order) } : detail,
  };
}

/** The sum the order records for its refund, or null if it records none. */
function refundFigure(order: Order): number | null {
  const amount = order.lifecycle?.refundAmount ?? 0;
  return amount > 0 ? amount : null;
}

/**
 * Wrap prose somebody typed into the one member of the union that carries it.
 *
 * The reason dialogs (reject, cancel, failed delivery) collect a closed reason
 * *and* an optional line of explanation. The reason goes to
 * `TransitionPatch.reason` and is stored on the lifecycle; the line is an event
 * detail, and this is what makes it one — so three call sites do not each write
 * the same object literal, and an empty textarea produces no detail rather than
 * an event annotated with the empty string.
 */
export function noteDetail(body: string | null | undefined): OrderEventDetail | null {
  const trimmed = body?.trim();
  return trimmed ? { kind: "note", body: trimmed } : null;
}
