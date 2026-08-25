"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Review,
  ReviewModerationRecord,
  ReviewReportReason,
  ReviewReporterRole,
} from "@/types";
import { buildReviewModeration } from "@/lib/mock/review-reports";
import {
  approveReview,
  hideReview,
  noteReviewRecord,
  pendingReviewCount,
  removeReview,
  reportReviewRecord,
  restoreReview,
  type ModerationError,
} from "@/lib/review-moderation";

/**
 * review-moderation store — what the platform has decided about reviews
 * (Phase 13, G29).
 *
 * It holds **one row per reported review** and nothing else. No review is copied
 * in: the corpus is synthesised by `lib/mock/reviews` and a customer's own
 * reviews live in `stores/reviews`, so a decision here is keyed on the review id
 * and joined back on every read by `services/reviews`. Two consequences worth
 * stating:
 *
 *  - The store stays the size of the work the desk has actually done, rather than
 *    growing a row for each of the twenty thousand reviews the catalogue claims.
 *  - A hidden review disappears from the storefront, the merchant board, the
 *    rider profile and the AI summary at once, because all four read the corpus
 *    through the seam and the seam is handed this map by
 *    `stores/reviews.useReviewContext`.
 *
 * Every mutation goes through `lib/review-moderation`, which refuses a duplicate
 * report, a decision with no grounds, a note too short to explain anything, and
 * any attempt to restore a removed review — and appends exactly one event to the
 * log each time. Nothing here writes a status directly. That is the same contract
 * `stores/customers` (Phase 11) holds to for accounts.
 */

const STORE_VERSION = 1;

/** What a moderation call gives back: the new record, or the reason it refused. */
interface ModerationResult {
  record: ReviewModerationRecord | null;
  error: ModerationError | null;
}

interface ReviewModerationState {
  /** Review id → its moderation record. */
  records: Record<string, ReviewModerationRecord>;
  hydrated: boolean;
  seeded: boolean;

  // -- reads -------------------------------------------------------------
  getRecord: (reviewId: string) => ReviewModerationRecord | undefined;

  // -- writes ------------------------------------------------------------
  /**
   * Flag a review. The review itself is passed in because the first report is
   * what mints the record, and the record needs the subject and vendor off it.
   */
  report: (
    review: Review,
    input: {
      reason: ReviewReportReason;
      note?: string | null;
      by: string;
      byRole: ReviewReporterRole;
    },
  ) => ModerationResult;
  /** Leave it up. */
  approve: (reviewId: string, input: { note?: string | null; by: string }) => ModerationResult;
  /** Take it off the storefront, reversibly. Grounds and a note required. */
  hide: (
    reviewId: string,
    input: { reason: ReviewReportReason; note: string; by: string },
  ) => ModerationResult;
  /** Take it down for good. Grounds and a note required; not reversible. */
  remove: (
    reviewId: string,
    input: { reason: ReviewReportReason; note: string; by: string },
  ) => ModerationResult;
  /** Put a hidden review back. */
  restore: (reviewId: string, input: { note?: string | null; by: string }) => ModerationResult;
  /** Write something down without changing the decision. */
  addNote: (reviewId: string, input: { body: string; by: string }) => ModerationResult;

  // -- lifecycle ---------------------------------------------------------
  seed: (now?: number) => void;
  resetDemo: (now?: number) => void;
  setHydrated: () => void;
}

export const useReviewModeration = create<ReviewModerationState>()(
  persist(
    (set, get) => ({
      records: {},
      hydrated: false,
      seeded: false,

      getRecord: (reviewId) => get().records[reviewId],

      report: (review, input) => {
        const existing = get().records[review.id] ?? null;
        const result = reportReviewRecord(existing, review, input);
        if (result.error) return { record: null, error: result.error };
        set((s) => ({ records: { ...s.records, [review.id]: result.record } }));
        return { record: result.record, error: null };
      },

      approve: (reviewId, input) =>
        decide(set, get, reviewId, (record) => approveReview(record, input)),

      hide: (reviewId, input) =>
        decide(set, get, reviewId, (record) => hideReview(record, input)),

      remove: (reviewId, input) =>
        decide(set, get, reviewId, (record) => removeReview(record, input)),

      restore: (reviewId, input) =>
        decide(set, get, reviewId, (record) => restoreReview(record, input)),

      addNote: (reviewId, input) =>
        decide(set, get, reviewId, (record) => noteReviewRecord(record, input)),

      seed: (now = Date.now()) => {
        if (get().seeded) return;
        const demo = buildReviewModeration(now);
        set((s) => ({
          // Merged, and this device's own record always wins: a review reported
          // here before the store was ever seeded must not be reset to the
          // seeded decision.
          records: { ...demo, ...s.records },
          seeded: true,
        }));
      },

      resetDemo: (now = Date.now()) =>
        set({ records: buildReviewModeration(now), seeded: true }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-review-moderation",
      version: STORE_VERSION,
      partialize: (s) => ({ records: s.records, seeded: s.seeded }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        state?.seed();
      },
    },
  ),
);

/**
 * The shape every decision shares: find the record, run the domain function, and
 * commit only if it agreed.
 *
 * A decision on a review nobody ever reported is refused rather than minting a
 * record: there is nothing to decide, and a queue row appearing out of an
 * "approve" would be a row no reporter ever asked for.
 */
function decide(
  set: (fn: (s: ReviewModerationState) => Partial<ReviewModerationState>) => void,
  get: () => ReviewModerationState,
  reviewId: string,
  apply: (
    record: ReviewModerationRecord,
  ) => { record: ReviewModerationRecord; error: ModerationError | null },
): ModerationResult {
  const existing = get().records[reviewId];
  if (!existing) return { record: null, error: "errors.reviewNotFound" };
  const result = apply(existing);
  if (result.error) return { record: null, error: result.error };
  set((s) => ({ records: { ...s.records, [reviewId]: result.record } }));
  return { record: result.record, error: null };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Reviews waiting on a decision — the admin nav badge. */
export function pendingModerationCount(
  records: Record<string, ReviewModerationRecord>,
): number {
  return pendingReviewCount(records);
}

/** Has this device's desk already taken a review down? Used by the report guard. */
export function isReviewModerated(
  records: Record<string, ReviewModerationRecord>,
  reviewId: string,
): boolean {
  const record = records[reviewId];
  return record ? record.status === "hidden" || record.status === "removed" : false;
}
