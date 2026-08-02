"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Percent,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import type { Reservation, ReservationStatus, TableStatus } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { useReservations } from "@/stores/reservations";
import { getVendorBook, setReservationStatus, type VendorBook } from "@/services/reservations";
import { effectiveReservationStatus, reservationTimeRange } from "@/lib/reservations";
import { addDays, fromDateKey, toDateKey } from "@/lib/dates";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { useDateLabel } from "@/components/reservations/use-date-label";
import { cn } from "@/lib/utils";

const TONE: Record<ReservationStatus, "primary" | "accent" | "fresh" | "neutral" | "danger"> = {
  pending: "accent",
  confirmed: "fresh",
  seated: "primary",
  completed: "neutral",
  cancelled: "neutral",
  "no-show": "danger",
};

/** The actions the floor can take, per derived status. Mirrors the seam's table. */
const ACTIONS: Partial<Record<ReservationStatus, { next: ReservationStatus; key: string }[]>> = {
  pending: [
    { next: "confirmed", key: "confirm" },
    { next: "cancelled", key: "decline" },
  ],
  confirmed: [
    { next: "seated", key: "seat" },
    { next: "no-show", key: "noShow" },
  ],
  seated: [{ next: "completed", key: "complete" }],
};

/**
 * BookView — `/dashboard/reservations`, the venue's side of C16.
 *
 * Two views of one service: the **book** (every party, in time order, with the
 * actions the floor can take) and the **floor** (which table each of them is
 * on, right now). Neither is stored — both are derived from the same bookings
 * the guest-facing grid is derived from, so the dashboard cannot drift out of
 * step with what the public site is selling.
 *
 * Status changes on synthesised bookings are recorded as overrides in the
 * reservations store and fed back to the seam, which is how a backendless
 * prototype keeps the floor's decisions without pretending to write to a book
 * it cannot own.
 */
export function BookView() {
  const t = useTranslations("reservations");
  const { vendor } = useDashboard();

  const localBookings = useReservations((s) => s.reservations);
  const overrides = useReservations((s) => s.statusOverrides);
  const hydrated = useReservations((s) => s.hydrated);
  const override = useReservations((s) => s.override);

  useEffect(() => {
    useReservations.persist.rehydrate();
  }, []);

  const [now] = useState(() => new Date());
  const dateLabel = useDateLabel(now);
  const [date, setDate] = useState(() => toDateKey(now));
  const [busyId, setBusyId] = useState<string | null>(null);

  const ctx = useMemo(
    () => ({ extra: localBookings, overrides }),
    [localBookings, overrides],
  );

  const [book, setBook] = useState<{ key: string; data: VendorBook | null } | null>(null);
  const bookKey = `${date}|${Object.keys(overrides).length}|${localBookings.length}`;

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    getVendorBook({ vendorId: vendor.id, date, now, ctx }).then((data) => {
      if (active) setBook({ key: bookKey, data });
    });
    return () => {
      active = false;
    };
  }, [vendor.id, date, now, ctx, hydrated, bookKey]);

  const loading = book?.key !== bookKey;
  const data = loading ? null : book.data;
  const isToday = date === toDateKey(now);

  function act(reservation: Reservation, next: ReservationStatus) {
    setBusyId(reservation.id);
    setReservationStatus(reservation, next, new Date()).then((res) => {
      setBusyId(null);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      override(reservation.id, next);
      toast.success(
        t("book.statusToast", {
          reference: reservation.reference,
          status: t(`status.${next}`),
        }),
      );
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 text-ink">{t("book.title")}</h1>
          <p className="text-sm text-muted">{t("book.subtitle")}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDate(toDateKey(addDays(fromDateKey(date), -1)))}
            aria-label={t("book.prevDay")}
            className="inline-flex size-10 items-center justify-center rounded-pill border border-line text-ink transition-colors hover:bg-surface-muted"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
          </button>
          <span className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-pill border border-line px-4 text-sm font-bold text-ink">
            <CalendarDays className="size-4 text-muted" aria-hidden />
            {dateLabel(date)}
          </span>
          <button
            type="button"
            onClick={() => setDate(toDateKey(addDays(fromDateKey(date), 1)))}
            aria-label={t("book.nextDay")}
            className="inline-flex size-10 items-center justify-center rounded-pill border border-line text-ink transition-colors hover:bg-surface-muted"
          >
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </button>
          {!isToday && (
            <button
              type="button"
              onClick={() => setDate(toDateKey(now))}
              className="text-sm font-semibold text-primary hover:underline"
            >
              {t("book.jumpToday")}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-60 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
        </div>
      ) : !data ? (
        <p className="text-body">{t("errors.notBookable")}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("book.statBookings")}
              value={String(data.summary.bookings)}
              icon={CalendarDays}
            />
            <StatCard
              label={t("book.statCovers")}
              value={String(data.summary.covers)}
              icon={Users}
            />
            <StatCard
              label={t("book.statPending")}
              value={String(data.summary.pending)}
              icon={UtensilsCrossed}
            />
            <StatCard
              label={t("book.statUtilisation")}
              value={`${Math.round(data.summary.utilisation * 100)}%`}
              icon={Percent}
              hint={t("book.utilisationHint")}
            />
          </div>

          {/* Floor */}
          <section className="rounded-panel border border-line bg-surface p-5">
            <h2 className="text-h3 text-ink">
              {isToday ? t("book.floorTitle") : t("book.floorTitleOther")}
            </h2>
            <p className="mt-1 text-xs text-muted">{t("book.floorHint")}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.floor.map((table) => (
                <FloorTile key={table.tableId} table={table} />
              ))}
            </div>
          </section>

          {/* The book */}
          <section className="rounded-panel border border-line bg-surface p-5">
            <h2 className="text-h3 text-ink">{t("book.listTitle")}</h2>
            {data.reservations.length === 0 ? (
              <p className="mt-4 text-sm text-body">{t("book.empty")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {data.reservations.map((reservation) => {
                  const status = effectiveReservationStatus(reservation, now);
                  const actions = ACTIONS[status] ?? [];
                  return (
                    <li key={reservation.id} className="flex flex-wrap gap-4 py-4">
                      <div className="w-20 shrink-0">
                        <p className="text-base font-extrabold text-ink">{reservation.time}</p>
                        <p className="text-xs text-muted">
                          {reservationTimeRange(reservation).split("–")[1]?.trim()}
                        </p>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-ink">{reservation.guest.name}</p>
                          <Badge tone={TONE[status]}>{t(`status.${status}`)}</Badge>
                          {reservation.occasion !== "none" && (
                            <Badge tone="accent">{t(`occasion.${reservation.occasion}`)}</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-muted">
                          {t("book.covers", { count: reservation.partySize })} ·{" "}
                          {reservation.tableLabels.length > 1
                            ? t("tablesLabel", {
                                labels: reservation.tableLabels.join(" + "),
                              })
                            : t("tableLabel", { labels: reservation.tableLabels.join("") })}{" "}
                          · {t(`zone.${reservation.zone}`)} · {reservation.guest.phone}
                        </p>
                        {reservation.notes && (
                          <p className="mt-1 text-xs text-body">
                            <span className="font-semibold">{t("book.noteLabel")}:</span>{" "}
                            {reservation.notes}
                          </p>
                        )}
                        {reservation.depositAmount > 0 && (
                          <p className="mt-1 text-xs text-muted">
                            {t("book.depositHeld", {
                              amount: formatPrice(
                                reservation.depositAmount,
                                reservation.currency as CurrencyCode,
                              ),
                            })}
                          </p>
                        )}
                      </div>

                      {actions.length > 0 && (
                        <div className="flex shrink-0 flex-wrap items-start gap-2">
                          {actions.map((action, index) => (
                            <button
                              key={action.next}
                              type="button"
                              onClick={() => act(reservation, action.next)}
                              disabled={busyId === reservation.id}
                              className={cn(
                                "rounded-pill px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60",
                                index === 0
                                  ? "bg-primary text-white hover:bg-primary-600"
                                  : "border border-line text-body hover:border-danger hover:text-danger",
                              )}
                            >
                              {t(`book.${action.key}`)}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted">{t("book.walkInHint")}</p>
          </section>
        </>
      )}
    </div>
  );
}

/** One table on the floor grid — occupied, or free with its next booking. */
function FloorTile({ table }: { table: TableStatus }) {
  const t = useTranslations("reservations");
  const occupied = Boolean(table.current);

  return (
    <div
      className={cn(
        "rounded-field border p-3",
        occupied ? "border-primary/40 bg-primary/5" : "border-line bg-surface-alt",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-extrabold text-ink">{table.label}</span>
        <span className="text-xs text-muted">{t("book.seats", { count: table.seats })}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{t(`zone.${table.zone}`)}</p>

      {table.current ? (
        <p className="mt-2 truncate text-xs font-semibold text-primary">
          {table.current.guest.name} ·{" "}
          {t("book.until", {
            time: reservationTimeRange(table.current).split("–")[1]?.trim() ?? "",
          })}
        </p>
      ) : (
        <p className="mt-2 text-xs font-semibold text-fresh-600">{t("book.free")}</p>
      )}

      {table.next && (
        <p className="mt-0.5 truncate text-xs text-muted">
          {t("book.nextAt", { time: table.next.time })} · {table.next.guest.name}
        </p>
      )}
    </div>
  );
}
