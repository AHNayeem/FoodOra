"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles, Star } from "lucide-react";
import type { Order, Rider } from "@/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * AssignRiderDialog — dispatch (spec §4).
 *
 * The spec allows either route: the system picks a rider automatically, or the
 * restaurant picks one. Both are offered here rather than one being buried,
 * because during a demonstration the automatic path is the story and the manual
 * path is the proof that the automatic path is not the only thing wired up.
 *
 * Riders who cannot take the job are shown struck out rather than hidden — a
 * dispatcher needs to see *why* the obvious choice is not available. Three
 * reasons, each said plainly: they handed this job back, they are already
 * carrying something, or they are off shift (G40). Before this the last two were
 * invisible here, so the manual path could assign work the automatic path would
 * have refused.
 */
export function AssignRiderDialog({
  open,
  order,
  fleet,
  busy,
  offShift,
  title,
  body,
  submitting = false,
  onClose,
  onAuto,
  onAssign,
}: {
  open: boolean;
  order: Order;
  fleet: Rider[];
  /** Riders already carrying an order. */
  busy?: ReadonlySet<string>;
  /** Riders off shift, or on a trip of their own. */
  offShift?: ReadonlySet<string>;
  /**
   * Heading and lead, for a caller whose job is not a first assignment — the
   * admin reassigning a courier is the same choice made for a different reason,
   * and it should not be labelled "assign a rider" when one is already on it.
   */
  title?: string;
  body?: string;
  submitting?: boolean;
  onClose: () => void;
  onAuto: () => void;
  onAssign: (rider: Rider) => void;
}) {
  const t = useTranslations("dashboard");
  const [selected, setSelected] = useState<string | null>(null);

  const declined = new Set(order.lifecycle.rejectedRiderIds);
  const available = fleet.filter((r) => !r.deletedAt);
  const chosen = available.find((r) => r.id === selected) ?? null;

  /** Why this rider cannot be picked, or null when they can. */
  function blockedReason(rider: Rider): string | null {
    if (declined.has(rider.id)) return "riderDeclined";
    if (busy?.has(rider.id)) return "riderCarrying";
    if (offShift?.has(rider.id)) return "riderOffShift";
    return null;
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="assign-title" className="sm:max-w-md">
      <div className="p-5 sm:p-6">
        <h2 id="assign-title" className="text-h3 text-ink">
          {title ?? t("assignTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">
          {body ?? t("assignBody", { number: order.orderNumber })}
        </p>

        <button
          type="button"
          onClick={onAuto}
          disabled={submitting}
          className="mt-4 flex w-full items-center gap-3 rounded-card border-2 border-primary bg-primary/5 p-4 text-start transition-colors hover:bg-primary/10 disabled:opacity-60"
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-primary text-white">
            {submitting ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-5" aria-hidden />
            )}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink">{t("autoAssign")}</span>
            <span className="block text-xs text-muted">{t("autoAssignHint")}</span>
          </span>
        </button>

        <p className="mt-5 text-xs font-bold tracking-wide text-muted uppercase">
          {t("orAssignManually")}
        </p>

        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {available.map((rider) => {
            const blocked = blockedReason(rider);
            const isSelected = selected === rider.id;
            return (
              <li key={rider.id}>
                <button
                  type="button"
                  disabled={Boolean(blocked) || submitting}
                  onClick={() => setSelected(rider.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-field border p-3 text-start transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-line hover:bg-surface-muted",
                    blocked && "opacity-45",
                  )}
                >
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-xs font-bold text-ink">
                    {initialsOf(rider.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-semibold text-ink",
                        blocked && "line-through",
                      )}
                    >
                      {rider.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Star className="size-3 fill-accent text-accent" aria-hidden />
                      {rider.rating.toFixed(1)}
                      <span aria-hidden>·</span>
                      {t(`vehicle.${rider.vehicle}`)}
                      <span aria-hidden>·</span>
                      {t("tripsCount", { count: rider.trips })}
                    </span>
                  </span>
                  {blocked && (
                    <span className="shrink-0 text-[11px] font-semibold text-danger">
                      {t(blocked)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" size="md" className="flex-1" onClick={onClose}>
            {t("back")}
          </Button>
          <Button
            size="md"
            className="flex-1"
            disabled={!chosen || submitting}
            onClick={() => chosen && onAssign(chosen)}
          >
            {t("assignSelected")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
