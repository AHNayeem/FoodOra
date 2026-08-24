import type { Customer, CustomerBlockReason } from "@/types";
import { customerIdFor, normalisePhone } from "@/lib/customers";

/**
 * customers.ts — the managed customer accounts the prototype opens with
 * (Phase 11, G15).
 *
 * Seeded for the same reason the orders and the disputes are: an operations desk
 * with an empty directory demonstrates nothing, and a reviewer should not have to
 * block themselves before they can see what blocking looks like.
 *
 * Three properties hold this together:
 *
 *  - **These are only the parts a person decided.** Profile, verification and
 *    account status. Not one number in `/admin/customers` comes from this file —
 *    spend, order counts and disputes are derived from the shared order and ticket
 *    stores by `lib/customers.buildDirectory`, so the directory cannot hold a
 *    second opinion about money (§5.4).
 *  - **They attach to people who actually ordered.** The phone numbers here are
 *    the ones `demo-orders` places its working set with, so a seeded account opens
 *    onto a real order history rather than a dangling profile. The two exceptions
 *    are deliberate and marked below.
 *  - **Deterministic given `now`.** Same device, same reload, same directory. The
 *    ids are derived from the phone (`customerIdFor`), so they are stable across
 *    devices too and a `/admin/customers/cus_…` link can be shared.
 *
 * The spec's demo-data list for customers asks for a normal account, a verified
 * one, an unverified one, one with orders and one with support tickets. All five
 * are below; the blocked account and the signed-up-but-never-ordered account are
 * here on top of that, because "block/unblock" and the empty-history state are
 * both features that would otherwise have no way to be seen.
 */

const DAY = 24 * 60 * 60_000;

/** One account to seed. Everything countable is derived, so this stays small. */
interface CustomerSpec {
  name: string;
  phone: string;
  email: string | null;
  /** The signed-in account, where this person has one. */
  userId?: string;
  avatar?: string;
  city?: string;
  isVerified: boolean;
  /** How long ago they signed up. */
  joinedDaysAgo: number;
  /** Blocked accounts carry their grounds and the note the moderator wrote. */
  block?: { reason: CustomerBlockReason; note: string; by: string; daysAgo: number };
  /** A standing note with no status change — the desk watching something. */
  note?: { body: string; by: string; daysAgo: number };
}

const MODERATOR = "Nusrat Jahan";

const SPECS: CustomerSpec[] = [
  // The signed-in demo account (`lib/mock/users.usr_customer`). Deliberately has
  // no seeded orders: this is the row a reviewer's *own* checkout lands on, so the
  // directory can be watched filling in rather than only read.
  {
    name: "Ayesha Rahman",
    phone: "+8801711000001",
    email: "customer@foodora.dev",
    userId: "usr_customer",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80",
    city: "Dhaka",
    isVerified: true,
    joinedDaysAgo: 420,
  },
  // Orders and disputes both — the row that shows every panel filled in.
  {
    name: "Ayasha Rahman",
    phone: "+8801711223344",
    email: "ayasha.rahman@example.com",
    city: "Dhaka",
    isVerified: true,
    joinedDaysAgo: 310,
  },
  {
    name: "Imran Chowdhury",
    phone: "+8801812345678",
    email: "imran.chowdhury@example.com",
    city: "Dhaka",
    isVerified: true,
    joinedDaysAgo: 268,
  },
  // Verified by phone, no email on file — the common shape of a real account.
  {
    name: "Nabila Karim",
    phone: "+8801915556677",
    email: null,
    city: "Dhaka",
    isVerified: true,
    joinedDaysAgo: 190,
  },
  // Unverified: signed up at checkout and never confirmed the code.
  {
    name: "Farhan Ahmed",
    phone: "+8801677889900",
    email: "farhan.ahmed@example.com",
    city: "Dhaka",
    isVerified: false,
    joinedDaysAgo: 96,
  },
  {
    name: "Sadia Islam",
    phone: "+8801533221100",
    email: "sadia.islam@example.com",
    city: "Dhaka",
    isVerified: true,
    joinedDaysAgo: 74,
  },
  // Watched but not stopped — the case the moderation log exists for.
  {
    name: "Rafiq Uddin",
    phone: "+8801744332211",
    email: "rafiq.uddin@example.com",
    city: "Dhaka",
    isVerified: true,
    joinedDaysAgo: 61,
    note: {
      body: "Third 'missing item' claim in a fortnight, all on card orders, all refunded. Not acting yet — the two restaurants involved are unrelated, so it may be genuine. Reviewing again at the end of the month.",
      by: "Priya Das",
      daysAgo: 4,
    },
  },
  {
    name: "Tasnim Haque",
    phone: "+8801988776655",
    email: "tasnim.haque@example.com",
    city: "Dhaka",
    isVerified: false,
    joinedDaysAgo: 38,
  },
  // Blocked, with grounds and a written reason — so the state, the chip, the
  // banner and the unblock control all have something to render on first load.
  {
    name: "Zayan Malik",
    phone: "+8801611224488",
    email: "zayan.malik@example.com",
    city: "Dhaka",
    isVerified: true,
    joinedDaysAgo: 143,
    block: {
      reason: "refund-abuse",
      note: "Six 'never arrived' claims in five weeks, four of them on orders the courier has a verified doorstep OTP for. Refunds paused and the account stopped pending an appeal.",
      by: MODERATOR,
      daysAgo: 9,
    },
  },
  // Signed up, never ordered — the empty-history state, which is otherwise
  // unreachable on a seeded device.
  {
    name: "Mahfuz Alam",
    phone: "+8801322110099",
    email: "mahfuz.alam@example.com",
    city: "Chattogram",
    isVerified: false,
    joinedDaysAgo: 6,
  },
];

/**
 * Build the seeded directory. Nothing here reads the clock — callers pass `now`,
 * exactly as `buildDemoOrders` and `buildDemoTickets` do.
 */
export function buildDemoCustomers(now: number): Customer[] {
  return SPECS.map((spec) => {
    const phone = normalisePhone(spec.phone);
    const joinedAt = new Date(now - spec.joinedDaysAgo * DAY).toISOString();
    const id = customerIdFor(phone);

    const moderation: Customer["moderation"] = [];
    if (spec.note) {
      const at = new Date(now - spec.note.daysAgo * DAY).toISOString();
      moderation.push({
        id: `cmo_${id}_note_seed`,
        action: "note",
        reason: null,
        body: spec.note.body,
        by: spec.note.by,
        at,
      });
    }
    const blockedAt = spec.block
      ? new Date(now - spec.block.daysAgo * DAY).toISOString()
      : null;
    if (spec.block && blockedAt) {
      moderation.push({
        id: `cmo_${id}_block_seed`,
        action: "block",
        reason: spec.block.reason,
        body: spec.block.note,
        by: spec.block.by,
        at: blockedAt,
      });
    }
    moderation.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

    return {
      id,
      name: spec.name,
      phone,
      email: spec.email,
      userId: spec.userId ?? null,
      avatar: spec.avatar ?? null,
      city: spec.city ?? null,
      isVerified: spec.isVerified,
      status: spec.block ? "blocked" : "active",
      blockReason: spec.block?.reason ?? null,
      blockedAt,
      blockedBy: spec.block?.by ?? null,
      joinedAt,
      moderation,
      createdAt: joinedAt,
      updatedAt: moderation[moderation.length - 1]?.at ?? joinedAt,
      deletedAt: null,
    } satisfies Customer;
  });
}
