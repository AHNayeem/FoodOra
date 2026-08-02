"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Info,
  Minus,
  PartyPopper,
  Plus,
  UserRound,
  Users,
} from "lucide-react";
import type {
  BookingPolicy,
  DayAvailability,
  OccasionType,
  TimeSlot,
  Vendor,
} from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { useAuth } from "@/frontend/stores/auth";
import { useReservations } from "@/frontend/stores/reservations";
import {
  createReservation,
  getAvailability,
  getAvailabilityOutlook,
  type DayOutlook,
} from "@/frontend/services/reservations";
import { OCCASIONS, depositFor } from "@/frontend/lib/reservations";
import { addDays, toDateKey, toMinutes } from "@/frontend/lib/dates";
import { formatPrice } from "@/frontend/lib/format";
import { Field } from "@/frontend/components/ui/field";
import { Input } from "@/frontend/components/ui/input";
import { cn } from "@/frontend/lib/utils";
import { useDateLabel } from "./use-date-label";

/** How many days the date rail shows at once. */
const RAIL_DAYS = 10;

/** Service periods the time grid is grouped under, by start hour. */
const PERIODS = [
  { key: "morning", from: 0, to: 11 },
  { key: "lunch", from: 11, to: 15 },
  { key: "afternoon", from: 15, to: 18 },
  { key: "dinner", from: 18, to: 24 },
] as const;

/**
 * BookingForm — the table-booking flow (Phase C16).
 *
 * Party size, day and time are one continuous question rather than three
 * steps, because in booking they are not independent: change the party and the
 * available times change with it. So every one of those controls re-asks the
 * availability engine, and the grid below always shows the answer for exactly
 * what is currently selected. Full times stay visible and disabled — seeing
 * that 20:00 is gone but 21:00 is free is the information, and hiding it would
 * make a busy evening look like an empty one.
 *
 * Submitting calls the simulated `createReservation`, which re-checks
 * availability at that moment and allocates the actual table. Frontend only: no
 * card is taken and no table is really held.
 */
export function BookingForm({
  vendor,
  policy,
  initialParty,
  initialDate,
  initialTime,
}: {
  vendor: Vendor;
  policy: BookingPolicy;
  initialParty: number;
  /** Prefilled from the directory's quick-book links, when they resolve. */
  initialDate: string | null;
  initialTime: string | null;
}) {
  const t = useTranslations("reservations");
  const router = useRouter();
  const currency = vendor.currency as CurrencyCode;

  const user = useAuth((s) => s.user);
  const authHydrated = useAuth((s) => s.hydrated);
  const localBookings = useReservations((s) => s.reservations);
  const storeHydrated = useReservations((s) => s.hydrated);
  const addReservation = useReservations((s) => s.add);

  useEffect(() => {
    useAuth.persist.rehydrate();
    useReservations.persist.rehydrate();
  }, []);

  // The clock is read once on the client, so the grid is stable for the life of
  // the form and never differs between server and first render.
  const [now] = useState(() => new Date());
  const dateLabel = useDateLabel(now);

  const [partySize, setPartySize] = useState(
    Math.min(Math.max(initialParty, policy.minPartySize), policy.maxPartySize),
  );
  const [date, setDate] = useState(initialDate ?? toDateKey(now));
  const [pickedTime, setTime] = useState(initialTime ?? "");
  const [occasion, setOccasion] = useState<OccasionType>("none");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Contact fields default to the signed-in account but stay overridable — the
  // table may well be under someone else's name. Holding "what the guest typed"
  // separately from "what we'd default to" keeps that a derived value rather
  // than an effect racing session hydration.
  const [typed, setTyped] = useState<{ name?: string; phone?: string; email?: string }>({});
  const name = typed.name ?? user?.name ?? "";
  const phone = typed.phone ?? user?.phone ?? "";
  const email = typed.email ?? user?.email ?? "";

  const ctx = useMemo(() => ({ extra: localBookings }), [localBookings]);

  /**
   * Availability is keyed by the question that produced it. Comparing the key
   * we have against the question currently on screen *is* the loading state —
   * no flag to flip, and no window where a stale grid looks current.
   */
  const query = `${date}|${partySize}`;
  const [result, setResult] = useState<{
    key: string;
    data: DayAvailability | null;
    error: string | null;
  } | null>(null);
  const [outlook, setOutlook] = useState<{ key: string; days: DayOutlook[] } | null>(null);

  /** Re-ask the engine whenever party, day, or the local book changes. */
  useEffect(() => {
    if (!storeHydrated) return;
    let active = true;
    getAvailability({ vendorId: vendor.id, date, partySize, now, ctx }).then((res) => {
      if (active) setResult({ key: query, data: res.data, error: res.error });
    });
    return () => {
      active = false;
    };
  }, [vendor.id, date, partySize, now, ctx, storeHydrated, query]);

  /** The date rail, so a full day can point at the next one that isn't. */
  useEffect(() => {
    if (!storeHydrated) return;
    let active = true;
    getAvailabilityOutlook({
      vendorId: vendor.id,
      from: toDateKey(now),
      days: RAIL_DAYS,
      partySize,
      now,
      ctx,
    }).then((days) => {
      if (active) setOutlook({ key: String(partySize), days });
    });
    return () => {
      active = false;
    };
  }, [vendor.id, partySize, now, ctx, storeHydrated]);

  const loadingSlots = result?.key !== query;
  const availability = loadingSlots ? null : result.data;
  const availabilityError = loadingSlots ? null : result.error;
  const railDays = useMemo(
    () => (outlook?.key === String(partySize) ? outlook.days : []),
    [outlook, partySize],
  );

  /**
   * The chosen time is only kept while the grid still offers it: change the
   * party from two to eight and a 20:00 that no longer fits quietly stops being
   * selected, rather than being submitted and refused by the seam.
   */
  const time =
    pickedTime && availability?.slots.some((s) => s.time === pickedTime && s.available)
      ? pickedTime
      : "";

  const changeParty = useCallback(
    (next: number) => {
      setPartySize(Math.min(Math.max(next, policy.minPartySize), policy.maxPartySize));
    },
    [policy.maxPartySize, policy.minPartySize],
  );

  const grouped = useMemo(() => {
    const slots = availability?.slots ?? [];
    return PERIODS.map((period) => ({
      key: period.key,
      slots: slots.filter((s) => {
        const hour = toMinutes(s.time) / 60;
        return hour >= period.from && hour < period.to;
      }),
    })).filter((group) => group.slots.length > 0);
  }, [availability]);

  /** The first day ahead that can still seat this party. */
  const nextOpenDay = useMemo(
    () => railDays.find((d) => d.date > date && d.openSlots > 0) ?? null,
    [railDays, date],
  );

  const deposit = depositFor(policy, partySize);
  const dayIsFull =
    !loadingSlots &&
    !!availability &&
    !availability.closed &&
    availability.slots.length > 0 &&
    !availability.slots.some((s) => s.available);

  function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    createReservation({
      vendorId: vendor.id,
      userId: user?.id ?? null,
      date,
      time,
      partySize,
      occasion,
      guest: { name, phone, email },
      notes: notes.trim() || null,
      now: new Date(),
      ctx,
    }).then((res) => {
      if (res.error || !res.data) {
        setSubmitting(false);
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      addReservation(res.data);
      toast.success(
        t(policy.autoConfirm ? "bookedToast" : "requestedToast", { name: vendor.name }),
      );
      router.push(`/reservations/${res.data.id}`);
    });
  }

  return (
    <div className="container-site py-8">
      <div className="mb-6">
        <Link
          href={`/restaurants/${vendor.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t("backToVenue", { name: vendor.name })}
        </Link>
        <h1 className="mt-1 text-h1 text-ink">{t("bookTitle", { name: vendor.name })}</h1>
        <p className="text-sm text-muted">{t("bookSubtitle")}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Party */}
          <Section
            title={t("partyTitle")}
            icon={Users}
            hint={t("partyHint", { count: policy.maxPartySize })}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-pill border border-line bg-surface p-1">
                <StepButton
                  icon={Minus}
                  label="−"
                  disabled={partySize <= policy.minPartySize}
                  onClick={() => changeParty(partySize - 1)}
                />
                <span className="min-w-24 text-center text-sm font-bold text-ink">
                  {t("guests", { count: partySize })}
                </span>
                <StepButton
                  icon={Plus}
                  label="+"
                  disabled={partySize >= policy.maxPartySize}
                  onClick={() => changeParty(partySize + 1)}
                />
              </div>
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                {[2, 4, 6, 8].
                  filter((n) => n >= policy.minPartySize && n <= policy.maxPartySize).
                  map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => changeParty(n)}
                      aria-pressed={partySize === n}
                      className={cn(
                        "size-10 shrink-0 rounded-pill border text-sm font-semibold transition-colors",
                        partySize === n
                          ? "border-primary bg-primary text-white"
                          : "border-line bg-surface text-body hover:border-primary hover:text-primary",
                      )}
                    >
                      {n}
                    </button>
                  ))}
              </div>
            </div>

            {partySize >= policy.maxPartySize && (
              <p className="mt-3 rounded-field bg-surface-muted p-3 text-xs text-body">
                <span className="font-semibold">
                  {t("morePeople", { count: policy.maxPartySize })}
                </span>{" "}
                {t("morePeopleBody")}{" "}
                <Link href="/catering" className="font-semibold text-primary hover:underline">
                  {t("morePeopleCta")}
                </Link>
              </p>
            )}
          </Section>

          {/* Day */}
          <Section
            title={t("dateTitle")}
            icon={CalendarDays}
            hint={t("dateHint", { count: policy.advanceDays })}
          >
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {railDays.map((day) => {
                const active = day.date === date;
                const unavailable = day.closed || day.openSlots === 0;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setDate(day.date)}
                    aria-pressed={active}
                    className={cn(
                      "flex min-w-20 shrink-0 flex-col items-center gap-0.5 rounded-field border px-3 py-2.5 transition-colors",
                      active
                        ? "border-primary bg-primary text-white"
                        : unavailable
                          ? "border-line bg-surface-muted text-muted"
                          : "border-line bg-surface text-body hover:border-primary hover:text-primary",
                    )}
                  >
                    <span className="text-xs font-semibold">{dateLabel(day.date)}</span>
                    <span className={cn("text-[11px]", active ? "text-white/80" : "text-muted")}>
                      {day.closed
                        ? t("book.closed")
                        : day.openSlots === 0
                          ? t("slotFull")
                          : t("slotsLeft", { count: day.openSlots })}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 max-w-56">
              <Field id="booking-date" label={t("dateLabel")}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="date"
                    min={toDateKey(now)}
                    max={toDateKey(addDays(now, policy.advanceDays))}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </Section>

          {/* Time */}
          <Section
            title={t("timeTitle")}
            icon={Clock}
            hint={t("timeHint", { count: policy.turnMinutes })}
          >
            {loadingSlots ? (
              <p className="text-sm text-muted">{t("checking")}</p>
            ) : availabilityError ? (
              <p className="text-sm font-medium text-danger">{t(availabilityError)}</p>
            ) : availability?.closed ? (
              <p className="text-sm text-body">{t("closedThatDay", { name: vendor.name })}</p>
            ) : (
              <>
                {dayIsFull && (
                  <div className="mb-4 rounded-field border border-line bg-surface-muted p-4">
                    <p className="text-sm font-semibold text-ink">{t("fullDayTitle")}</p>
                    <p className="mt-0.5 text-sm text-body">{t("fullDayBody")}</p>
                    {nextOpenDay?.firstAvailable && (
                      <button
                        type="button"
                        onClick={() => setDate(nextOpenDay.date)}
                        className="mt-2 text-sm font-semibold text-primary hover:underline"
                      >
                        {t("nextOpenOn", {
                          date: dateLabel(nextOpenDay.date),
                          time: nextOpenDay.firstAvailable,
                        })}
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  {grouped.map((group) => (
                    <div key={group.key}>
                      <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
                        {t(`period.${group.key}`)}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.slots.map((slot) => (
                          <SlotButton
                            key={slot.time}
                            slot={slot}
                            active={slot.time === time}
                            onClick={() => setTime(slot.time)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>

          {/* Occasion */}
          <Section title={t("occasionTitle")} icon={PartyPopper}>
            <div className="flex flex-wrap gap-2">
              {OCCASIONS.map((key) => (
                <Chip key={key} active={occasion === key} onClick={() => setOccasion(key)}>
                  {t(`occasion.${key}`)}
                </Chip>
              ))}
            </div>
          </Section>

          {/* Guest */}
          <Section title={t("guestTitle")} icon={UserRound}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="booking-name" label={t("guestName")}>
                {({ id }) => (
                  <Input
                    id={id}
                    value={name}
                    onChange={(e) => setTyped((c) => ({ ...c, name: e.target.value }))}
                  />
                )}
              </Field>
              <Field id="booking-phone" label={t("guestPhone")}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="tel"
                    value={phone}
                    onChange={(e) => setTyped((c) => ({ ...c, phone: e.target.value }))}
                  />
                )}
              </Field>
              <Field id="booking-email" label={t("guestEmail")}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="email"
                    value={email}
                    onChange={(e) => setTyped((c) => ({ ...c, email: e.target.value }))}
                  />
                )}
              </Field>
            </div>
          </Section>

          {/* Notes */}
          <Section title={t("notesTitle")} hint={t("notesHint")}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("notesPlaceholder")}
              className="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </Section>
        </div>

        {/* Live summary */}
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="rounded-panel border border-line bg-surface p-6 shadow-card">
            <h2 className="text-h3 text-ink">{t("summaryTitle")}</h2>
            <p className="mt-0.5 text-xs text-muted">{vendor.name}</p>

            <dl className="mt-4 space-y-2 border-b border-line pb-4 text-sm">
              <SummaryRow label={t("summaryDate")} value={dateLabel(date, { relative: false })} />
              <SummaryRow label={t("summaryTime")} value={time || t("summaryPending")} />
              <SummaryRow
                label={t("summaryParty")}
                value={t("guests", { count: partySize })}
              />
              <SummaryRow
                label={t("summaryHeld")}
                value={t("heldMinutes", { count: policy.turnMinutes })}
              />
            </dl>

            {deposit > 0 && (
              <div className="border-b border-line py-4">
                <p className="text-sm font-semibold text-ink">{t("depositTitle")}</p>
                <p className="mt-0.5 text-xs text-body">
                  {t("depositBody", { amount: formatPrice(deposit, currency) })}
                </p>
              </div>
            )}

            <p className="py-4 text-xs text-body">
              {policy.autoConfirm ? t("instantNote") : t("reviewNote")}
            </p>
            <p className="text-xs text-muted">
              {t("cancelNote", { count: policy.cancelCutoffHours })}
            </p>

            {authHydrated && !user ? (
              <Link
                href={`/login?next=/restaurants/${vendor.slug}/book`}
                className="mt-5 inline-flex h-13 w-full items-center justify-center rounded-pill bg-primary px-6 text-base font-semibold text-white transition-colors hover:bg-primary-600"
              >
                {t("signInToBook")}
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !time || !authHydrated}
                className="mt-5 inline-flex h-13 w-full items-center justify-center rounded-pill bg-primary px-6 text-base font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
              >
                {submitting
                  ? t("confirming")
                  : policy.autoConfirm
                    ? t("confirmBooking")
                    : t("requestBooking")}
              </button>
            )}
            <p className="mt-3 text-center text-xs text-muted">{t("noChargeNote")}</p>

            {policy.note && (
              <div className="mt-5 flex gap-2 rounded-field bg-surface-muted p-3">
                <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <div>
                  <p className="text-xs font-semibold text-ink">{t("venueNote")}</p>
                  <p className="mt-0.5 text-xs text-body">{policy.note}</p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * One time on the grid. A taken slot stays visible but disabled and says so —
 * a busy evening should look busy, not empty.
 */
function SlotButton({
  slot,
  active,
  onClick,
}: {
  slot: TimeSlot;
  active: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("reservations");
  const title = slot.available
    ? undefined
    : slot.reason === "too-soon"
      ? t("slotTooSoon")
      : t("slotFull");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!slot.available}
      aria-pressed={active}
      title={title}
      className={cn(
        "inline-flex h-11 min-w-18 items-center justify-center rounded-field border px-3 text-sm font-bold transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : slot.available
            ? "border-line bg-surface text-ink hover:border-primary hover:text-primary"
            : "cursor-not-allowed border-transparent bg-surface-muted text-muted line-through",
      )}
    >
      {slot.time}
    </button>
  );
}

function Section({
  title,
  icon: Icon,
  hint,
  children,
}: {
  title: string;
  icon?: typeof Users;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 text-h3 text-ink">
        {Icon && <Icon className="size-5 text-primary" aria-hidden />}
        {title}
      </h2>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-pill border px-4 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-line bg-surface text-body hover:border-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function StepButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex size-9 items-center justify-center rounded-pill text-ink transition-colors hover:bg-surface-muted disabled:opacity-40"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="min-w-0 text-body">{label}</dt>
      <dd className="shrink-0 text-end font-medium text-ink">{value}</dd>
    </div>
  );
}
