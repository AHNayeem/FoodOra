"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bike, Camera, Loader2, X } from "lucide-react";
import type { FoodItem, Order, Review, ReviewAspect, ReviewDraft, ReviewMedia, ReviewTag } from "@/types";
import {
  MAX_COMMENT_LENGTH,
  MAX_REVIEW_MEDIA,
  emptyDraft,
  ratingBandKey,
  tagsForRating,
} from "@/lib/reviews";
import {
  getPhotoLibrary,
  getReviewableDishes,
  submitReview,
  updateReview,
} from "@/services/reviews";
import { useReviewContext, useReviews } from "@/stores/reviews";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StarInput } from "./stars";

/**
 * WriteReviewDialog — the one form that writes a review (Phase C22).
 *
 * It asks in the order a person answers: the overall star first, and only then
 * the things that depend on it. Tags appear once there is a rating, because the
 * vocabulary offered follows the sentiment already expressed
 * (`lib/reviews.tagsForRating`) — nudging a one-star reviewer towards "will
 * reorder" would be a leading question.
 *
 * The courier is scored separately in the same submission: a late rider is not
 * the kitchen's fault and a cold kitchen is not the rider's, so the seam writes
 * two rows (`Review.subject`). Nothing here decides whether the review is
 * allowed — the window, the duplicate check and the content rules all live in
 * `services/reviews`, and this form only reports what it refused.
 */
export function WriteReviewDialog({
  order,
  open,
  onClose,
  existing = null,
}: {
  order: Order;
  open: boolean;
  onClose: () => void;
  /** Pass the review to edit; omit to write a new one. */
  existing?: Review | null;
}) {
  const t = useTranslations("reviews");
  return (
    <Modal open={open} onClose={onClose} labelledBy="write-review-title" className="sm:max-w-lg">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
        <div className="min-w-0">
          <h2 id="write-review-title" className="text-h3 text-ink">
            {existing ? t("editTitle") : t("writeTitle", { vendor: order.vendor.name })}
          </h2>
          <p className="truncate text-sm text-muted">
            {t("orderRef", { number: order.orderNumber })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="-me-1 inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-muted hover:bg-surface-muted hover:text-ink"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {/* The form only exists while the dialog is open, so its draft is seeded
          by a state initializer rather than reset by an effect — closing it is
          what discards a half-written review. */}
      {open && (
        <ReviewForm
          key={existing?.id ?? order.id}
          order={order}
          existing={existing}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

/** Everything the dialog collects. Mounted only while the dialog is open. */
function ReviewForm({
  order,
  existing,
  onClose,
}: {
  order: Order;
  existing: Review | null;
  onClose: () => void;
}) {
  const t = useTranslations("reviews");
  const user = useAuth((s) => s.user);
  const ctx = useReviewContext();
  const addReview = useReviews((s) => s.addReview);
  const rateOrder = useOrders((s) => s.rateOrder);
  const replaceReview = useReviews((s) => s.replaceReview);

  // Editing starts from the review as it stands, so the form *is* the review
  // rather than a blank one beside it.
  const [draft, setDraft] = useState<ReviewDraft>(() =>
    existing
      ? {
          rating: existing.rating,
          aspects: existing.aspects,
          comment: existing.comment,
          tags: existing.tags,
          dishIds: existing.dishIds,
          media: existing.media,
          riderRating: null,
        }
      : emptyDraft(),
  );
  const [dishes, setDishes] = useState<FoodItem[]>([]);
  const [library, setLibrary] = useState<ReviewMedia[]>([]);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [busy, setBusy] = useState(false);

  const rider = order.lifecycle.rider;
  const isDelivery = order.fulfillment === "delivery";

  // The order's dishes for the picker and the photo library for the attach
  // button — both fetched once, when the form appears.
  useEffect(() => {
    let live = true;
    getReviewableDishes(order).then((next) => live && setDishes(next));
    getPhotoLibrary().then((next) => live && setLibrary(next));
    return () => {
      live = false;
    };
  }, [order]);

  function patch(next: Partial<ReviewDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function toggleTag(tag: ReviewTag) {
    patch({
      tags: draft.tags.includes(tag)
        ? draft.tags.filter((item) => item !== tag)
        : [...draft.tags, tag],
    });
  }

  function toggleDish(foodId: string) {
    patch({
      dishIds: draft.dishIds.includes(foodId)
        ? draft.dishIds.filter((id) => id !== foodId)
        : [...draft.dishIds, foodId],
    });
  }

  function attach(media: ReviewMedia) {
    setPickingPhoto(false);
    if (draft.media.some((m) => m.url === media.url)) return;
    // Give each attachment an id of its own — the library entry is a template,
    // not the row, and two reviews must not share a media id.
    patch({
      media: [
        ...draft.media,
        { ...media, id: `${media.id}_${draft.media.length}_${order.id}` },
      ].slice(0, MAX_REVIEW_MEDIA),
    });
  }

  function save() {
    if (busy) return;
    setBusy(true);

    const done = (message: string) => {
      setBusy(false);
      toast.success(message);
      onClose();
    };
    const failed = (error: string | null) => {
      setBusy(false);
      toast.error(t(error ?? "errors.ratingRequired"));
    };

    if (existing) {
      updateReview(existing.id, draft, ctx).then((res) => {
        if (!res.data) return failed(res.error);
        replaceReview(res.data);
        done(t("updated"));
      });
      return;
    }

    submitReview(
      order,
      draft,
      {
        id: user?.id ?? "usr_guest",
        name: user?.name ?? t("anonymous"),
        avatar: user?.avatar ?? null,
      },
      ctx,
    ).then((res) => {
      if (!res.data) return failed(res.error);
      const { review, riderReview } = res.data;
      addReview(...(riderReview ? [review, riderReview] : [review]));
      /**
       * The review's star is also the order's score (Phase 17, G36).
       *
       * Written through the orders store rather than here, because that action is
       * the single writer of `lifecycle.rating` — the star control on the tracker
       * calls the same one. It is a no-op when the order was already rated, so a
       * customer who tapped a star and then wrote a review keeps the score they
       * first gave rather than having it silently restated.
       */
      rateOrder(order.id, review.rating);
      done(t("submitted", { vendor: order.vendor.name }));
    });
  }

  const tagOptions = draft.rating > 0 ? tagsForRating(draft.rating) : [];
  const aspects: ReviewAspect[] = isDelivery
    ? ["food", "delivery", "packaging", "value"]
    : ["food", "packaging", "value"];

  return (
    <>
      <div className="space-y-6 px-5 py-5">
        {/* Overall */}
        <section className="flex flex-col items-center gap-2 rounded-panel bg-surface-alt p-5 text-center">
          <p className="font-semibold text-ink">{t("overallQuestion")}</p>
          <StarInput
            value={draft.rating}
            onChange={(rating) => patch({ rating })}
            name="overall"
            label={t("overallQuestion")}
            size="xl"
          />
          <p className="h-5 text-sm font-semibold text-primary">
            {draft.rating > 0 ? t(`band.${ratingBandKey(draft.rating)}`) : ""}
          </p>
        </section>

        {/* Aspects */}
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
            {t("aspectsTitle")}
          </h3>
          <ul className="mt-3 space-y-2">
            {aspects.map((aspect) => (
              <li key={aspect} className="flex items-center justify-between gap-3">
                <span className="text-sm text-body">{t(`aspect.${aspect}`)}</span>
                <StarInput
                  value={draft.aspects[aspect] ?? 0}
                  onChange={(value) =>
                    patch({ aspects: { ...draft.aspects, [aspect]: value } })
                  }
                  name={`aspect-${aspect}`}
                  label={t(`aspect.${aspect}`)}
                  size="md"
                />
              </li>
            ))}
          </ul>
        </section>

        {/* Tags — offered only once the stars say which half of the vocabulary fits */}
        {tagOptions.length > 0 && (
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
              {t("tagsTitle")}
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {tagOptions.map((tag) => {
                const on = draft.tags.includes(tag);
                return (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => toggleTag(tag)}
                      aria-pressed={on}
                      className={cn(
                        "rounded-pill border px-3 py-1.5 text-sm font-medium transition-colors",
                        on
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-line text-body hover:bg-surface-muted",
                      )}
                    >
                      {t(`tag.${tag}`)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Dishes */}
        {dishes.length > 0 && (
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
              {t("dishesTitle")}
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {dishes.map((dish) => {
                const on = draft.dishIds.includes(dish.id);
                return (
                  <li key={dish.id}>
                    <button
                      type="button"
                      onClick={() => toggleDish(dish.id)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-pill border py-1 pe-3 ps-1 text-sm font-medium transition-colors",
                        on
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-line text-body hover:bg-surface-muted",
                      )}
                    >
                      <Image
                        src={dish.image}
                        alt=""
                        width={28}
                        height={28}
                        className="size-7 rounded-pill object-cover"
                      />
                      {dish.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Comment */}
        <section>
          <label className="block">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">
              {t("commentTitle")}
            </span>
            <textarea
              value={draft.comment}
              onChange={(e) => patch({ comment: e.target.value })}
              rows={4}
              maxLength={MAX_COMMENT_LENGTH}
              placeholder={t("commentPlaceholder")}
              className="mt-2 w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
          <p className="mt-1 text-end text-xs text-muted">
            {draft.comment.length}/{MAX_COMMENT_LENGTH}
          </p>
        </section>

        {/* Photos */}
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
            {t("photosTitle")}
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {draft.media.map((media) => (
              <li key={media.id} className="relative">
                <Image
                  src={media.thumbnail}
                  alt=""
                  width={72}
                  height={72}
                  className="size-18 rounded-card object-cover"
                />
                <button
                  type="button"
                  onClick={() => patch({ media: draft.media.filter((m) => m.id !== media.id) })}
                  aria-label={t("removePhoto")}
                  className="absolute -end-1.5 -top-1.5 inline-flex size-6 items-center justify-center rounded-pill bg-ink text-white"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
            {draft.media.length < MAX_REVIEW_MEDIA && (
              <li>
                <button
                  type="button"
                  onClick={() => setPickingPhoto((v) => !v)}
                  aria-expanded={pickingPhoto}
                  className="inline-flex size-18 flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line text-xs text-muted hover:bg-surface-muted"
                >
                  <Camera className="size-5" aria-hidden />
                  {t("addPhoto")}
                </button>
              </li>
            )}
          </ul>
          {pickingPhoto && (
            <>
              <p className="mt-3 text-xs text-muted">{t("photoLibraryHint")}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {library.map((media) => (
                  <li key={media.id}>
                    <button
                      type="button"
                      onClick={() => attach(media)}
                      className="block overflow-hidden rounded-card border border-line transition-transform hover:scale-[1.03]"
                    >
                      <Image
                        src={media.thumbnail}
                        alt=""
                        width={64}
                        height={64}
                        className="size-16 object-cover"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* The courier — a separate row, written in the same breath */}
        {rider && !existing && (
          <section className="rounded-panel border border-line bg-surface-alt p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Bike className="size-4 text-primary" aria-hidden />
                {t("riderQuestion", { name: rider.name })}
              </span>
              <StarInput
                value={draft.riderRating ?? 0}
                onChange={(riderRating) => patch({ riderRating })}
                name="rider"
                label={t("riderQuestion", { name: rider.name })}
                size="md"
              />
            </div>
            <p className="mt-1.5 text-xs text-muted">{t("riderHint")}</p>
          </section>
        )}
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-line bg-surface px-5 py-4">
        <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button className="flex-1" onClick={save} disabled={busy || draft.rating === 0}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {existing ? t("saveChanges") : t("submit")}
        </Button>
      </div>
    </>
  );
}
