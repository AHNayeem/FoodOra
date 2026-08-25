import type {
  Review,
  ReviewModerationRecord,
  ReviewReportReason,
  ReviewReporterRole,
} from "@/types";
import {
  approveReview,
  hideReview,
  removeReview,
  reportReviewRecord,
} from "@/lib/review-moderation";
import { buildVendorReviews } from "./reviews";
import { vendorById } from "./vendors";

/**
 * review-reports.ts — the moderation queue's seed (Phase 13, G29).
 *
 * The corpus this points at is synthesised (`lib/mock/reviews`), and that is what
 * makes the seed possible: `buildVendorReviews` gives every review a
 * **deterministic id** (`rev_<vendorId>_<index>`) drawn from a PRNG seeded on the
 * vendor, so a seeded report can name a review that will still be there — with
 * the same stars and the same words — on the next reload. Nothing is duplicated:
 * the report references the review, it does not copy it.
 *
 * Reviews are chosen by **rule rather than by index**, because the index that
 * happens to hold a one-star review is an accident of the generator and would
 * silently point at a glowing review if the corpus ever changed. `pickReview`
 * asks for "their worst review" or "a five-star with a photo" and the seed says
 * what was reported about it.
 *
 * The records are built by running the **real domain functions** — a report, then
 * the decision the desk took — rather than by writing record literals. A seeded
 * record therefore cannot be in a state `lib/review-moderation` would refuse, and
 * its log reads exactly like one produced on this device: same event ids, same
 * ordering, same required grounds and notes.
 */

const DAY = 86_400_000;

/** Which review of a vendor's corpus a seed is about. */
type Pick = "worst" | "secondWorst" | "gloryWithPhoto" | "newest";

interface ReportSeed {
  reason: ReviewReportReason;
  /** A display label — a restaurant, a customer, or the safety desk. */
  by: string;
  byRole: ReviewReporterRole;
  note: string;
  daysAgo: number;
}

interface DecisionSeed {
  action: "approve" | "hide" | "remove";
  reason?: ReviewReportReason;
  note: string;
  by: string;
  daysAgo: number;
}

interface RecordSeed {
  vendorId: string;
  pick: Pick;
  reports: ReportSeed[];
  decision?: DecisionSeed;
}

/**
 * The queue as a reviewer first meets it: three reviews waiting on a decision,
 * one already left up, one hidden and one removed — so every segment, every
 * status chip and the moderation log all have something real behind them before
 * anybody reports anything.
 */
const SEEDS: RecordSeed[] = [
  {
    vendorId: "ven_bella_napoli",
    pick: "worst",
    reports: [
      {
        reason: "offensive",
        by: "Bella Napoli",
        byRole: "vendor",
        note: "The review calls our kitchen staff names. We are happy to be criticised on the food, not this.",
        daysAgo: 2,
      },
      {
        reason: "fake",
        by: "Trust & Safety",
        byRole: "platform",
        note: "Flagged by the weekly sweep: the same paragraph appears on two other restaurants this month.",
        daysAgo: 1,
      },
    ],
  },
  {
    vendorId: "ven_burger_lab",
    pick: "secondWorst",
    reports: [
      {
        reason: "wrong-order",
        by: "Burger Lab",
        byRole: "vendor",
        note: "This describes a biryani order. It was not ours — please check the order reference.",
        daysAgo: 3,
      },
    ],
  },
  {
    vendorId: "ven_bangkok_house",
    pick: "worst",
    reports: [
      {
        reason: "off-topic",
        by: "Bangkok House",
        byRole: "vendor",
        note: "The complaint is entirely about the app's tracking map, not about the food we cooked.",
        daysAgo: 1,
      },
    ],
  },
  {
    vendorId: "ven_sakura_sushi",
    pick: "gloryWithPhoto",
    reports: [
      {
        reason: "spam",
        by: "Imran Chowdhury",
        byRole: "customer",
        note: "Reads like an advertisement and the photo looks like a stock image to me.",
        daysAgo: 5,
      },
    ],
    decision: {
      action: "approve",
      note: "Checked the order behind it and the photo's timestamp. Genuine customer, genuine meal — left up.",
      by: "moderation@foodora.dev",
      daysAgo: 4,
    },
  },
  {
    vendorId: "ven_spice_route",
    pick: "worst",
    reports: [
      {
        reason: "personal-info",
        by: "Spice Route",
        byRole: "vendor",
        note: "It names the rider and prints his mobile number in the last line.",
        daysAgo: 6,
      },
    ],
    decision: {
      action: "hide",
      reason: "personal-info",
      note: "Hidden while the author is asked to remove the rider's phone number. The rest of the complaint is fair.",
      by: "moderation@foodora.dev",
      daysAgo: 5,
    },
  },
  {
    vendorId: "ven_the_daily_grind",
    pick: "worst",
    reports: [
      {
        reason: "offensive",
        by: "The Daily Grind",
        byRole: "vendor",
        note: "Racist abuse aimed at the barista. We have asked for it to be taken down.",
        daysAgo: 8,
      },
      {
        reason: "offensive",
        by: "Tasnim Haque",
        byRole: "customer",
        note: "Nobody should have to read this on a menu page.",
        daysAgo: 8,
      },
    ],
    decision: {
      action: "remove",
      reason: "offensive",
      note: "Slurs aimed at a named member of staff. Removed under the abuse policy; the account has been noted.",
      by: "moderation@foodora.dev",
      daysAgo: 7,
    },
  },
];

/** Resolve a seed's rule against a real corpus. Null when nothing fits. */
function pickReview(corpus: Review[], pick: Pick): Review | null {
  if (corpus.length === 0) return null;
  switch (pick) {
    case "worst": {
      return [...corpus].sort((a, b) => a.rating - b.rating)[0] ?? null;
    }
    case "secondWorst": {
      const sorted = [...corpus].sort((a, b) => a.rating - b.rating);
      return sorted[1] ?? sorted[0] ?? null;
    }
    case "gloryWithPhoto": {
      return (
        corpus.find((r) => r.rating === 5 && r.media.length > 0) ??
        corpus.find((r) => r.rating === 5) ??
        corpus[0]
      );
    }
    case "newest":
      return corpus[0];
  }
}

/**
 * The moderation records this device starts with, keyed by review id.
 *
 * `now` is passed in rather than read: the seed never touches the clock (the C10
 * rule), so module evaluation stays deterministic and the report timestamps are
 * always days rather than years old.
 */
export function buildReviewModeration(now: number): Record<string, ReviewModerationRecord> {
  const records: Record<string, ReviewModerationRecord> = {};

  for (const seed of SEEDS) {
    if (!vendorById.has(seed.vendorId)) continue;
    const review = pickReview(buildVendorReviews(seed.vendorId, now), seed.pick);
    if (!review) continue;
    // Two seeds must never land on the same review — the second report would be
    // refused as a duplicate and the queue would silently be one row short.
    if (records[review.id]) continue;

    let record: ReviewModerationRecord | null = null;
    for (const report of seed.reports) {
      const result = reportReviewRecord(
        record,
        review,
        {
          reason: report.reason,
          note: report.note,
          by: report.by,
          byRole: report.byRole,
        },
        now - report.daysAgo * DAY,
      );
      if (result.error) continue;
      record = result.record;
    }
    if (!record) continue;

    const decision = seed.decision;
    if (decision) {
      const at = now - decision.daysAgo * DAY;
      const applied =
        decision.action === "approve"
          ? approveReview(record, { note: decision.note, by: decision.by }, at)
          : decision.action === "hide"
            ? hideReview(
                record,
                { reason: decision.reason ?? "other", note: decision.note, by: decision.by },
                at,
              )
            : removeReview(
                record,
                { reason: decision.reason ?? "other", note: decision.note, by: decision.by },
                at,
              );
      // A refusal here would mean the seed contradicts the domain — keep the
      // reported record rather than a half-applied one, and let the queue show it
      // as pending, which is the truth in that case.
      if (!applied.error) record = applied.record;
    }

    records[review.id] = record;
  }

  return records;
}
