"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  MapPin,
  Repeat,
  UtensilsCrossed,
} from "lucide-react";
import type {
  DeliveryAddress,
  MealPlan,
  MealSlot,
  PlanTier,
  SavedAddress,
  Vendor,
  Weekday,
} from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { useAuth } from "@/frontend/stores/auth";
import { useAddresses } from "@/frontend/stores/addresses";
import { useSubscriptions } from "@/frontend/stores/subscriptions";
import { getAddressBook } from "@/frontend/services/account";
import { createSubscription, toPlanRef } from "@/frontend/services/subscriptions";
import {
  DELIVERY_WINDOWS,
  MEAL_SLOTS,
  MIN_DELIVERY_DAYS,
  buildSchedule,
  computeSubscriptionPricing,
  earliestStartDate,
} from "@/frontend/lib/subscriptions";
import { fromDateKey } from "@/frontend/lib/dates";
import { formatPrice } from "@/frontend/lib/format";
import { Field } from "@/frontend/components/ui/field";
import { Input } from "@/frontend/components/ui/input";
import { AddressFields, emptyAddress, type NewAddress } from "@/frontend/components/checkout/address-fields";
import { cn } from "@/frontend/lib/utils";

type FieldKey = "start" | "days" | "address" | "recipient" | "line1" | "area" | "city";
type FieldErrors = Partial<Record<FieldKey, string>>;

function toDeliveryAddress(a: SavedAddress): DeliveryAddress {
  return {
    label: a.label,
    recipient: a.recipient,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    area: a.area,
    city: a.city,
    countryCode: a.countryCode,
    instructions: a.instructions,
  };
}

/**
 * SubscribeBuilder — the subscription flow (Phase C15). Everything a recurring
 * commitment needs is on one page: the tier (how long, how many meals a day),
 * which meals, which weekdays, when it starts, where it goes — with a live
 * per-cycle price beside it. Submitting calls the simulated `createSubscription`,
 * commits the returned record to the subscriptions store and routes to the
 * manage page. Frontend only: no payment is taken and nothing renews for real.
 */
export function SubscribeBuilder({
  plan,
  tiers,
  vendor,
  initialTierId,
}: {
  plan: MealPlan;
  tiers: PlanTier[];
  vendor: Vendor;
  /** Tier pre-selected from the detail page (`?tier=`), if it still resolves. */
  initialTierId: string | null;
}) {
  const t = useTranslations("subscriptions");
  const locale = useLocale();
  const router = useRouter();
  const currency = plan.currency as CurrencyCode;

  const user = useAuth((s) => s.user);
  const authHydrated = useAuth((s) => s.hydrated);
  const savedAddrs = useAddresses((s) => s.addresses);
  const addrHydrated = useAddresses((s) => s.hydrated);
  const addrSeeded = useAddresses((s) => s.seeded);
  const seedAddrs = useAddresses((s) => s.seed);
  const addSubscription = useSubscriptions((s) => s.add);

  useEffect(() => {
    useAuth.persist.rehydrate();
    useAddresses.persist.rehydrate();
    useSubscriptions.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (addrHydrated && !addrSeeded) getAddressBook().then(seedAddrs);
  }, [addrHydrated, addrSeeded, seedAddrs]);

  // The clock is read once, on the client, so the calendar below is stable for
  // the life of the form and never differs between server and first render.
  const [now] = useState(() => new Date());
  const earliestStart = useMemo(
    () => earliestStartDate(now, plan.leadTimeDays),
    [now, plan.leadTimeDays],
  );

  const defaultTier =
    tiers.find((tier) => tier.id === initialTierId) ??
    tiers.find((tier) => tier.isPopular) ??
    tiers[0];
  const [tierId, setTierId] = useState(defaultTier?.id ?? "");
  const tier = tiers.find((x) => x.id === tierId) ?? defaultTier;

  const [slots, setSlots] = useState<MealSlot[]>(() =>
    plan.slots.slice(0, defaultTier?.mealsPerDay ?? 1),
  );
  const [deliveryDays, setDeliveryDays] = useState<Weekday[]>(plan.deliveryDays);
  const [startDate, setStartDate] = useState(earliestStart);
  const [deliveryWindow, setDeliveryWindow] = useState(
    () => DELIVERY_WINDOWS[plan.slots[0] ?? "lunch"],
  );
  const [addressMode, setAddressMode] = useState<"saved" | "new">("saved");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [newAddress, setNewAddress] = useState<NewAddress>(emptyAddress);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const defaultAddressId = savedAddrs.find((a) => a.isDefault)?.id ?? savedAddrs[0]?.id ?? "";
  const activeAddressId = selectedAddressId || defaultAddressId;
  const showSavedList = addressMode === "saved" && savedAddrs.length > 0;

  const pricing = useMemo(
    () =>
      computeSubscriptionPricing({
        pricePerMeal: tier?.pricePerMeal ?? 0,
        mealsPerDay: tier?.mealsPerDay ?? 1,
        deliveryDaysPerWeek: deliveryDays.length,
        cycle: tier?.cycle ?? "weekly",
        discountRate: tier?.discountRate ?? 0,
        deliveryFeePerDay: plan.deliveryFeePerDay,
        currency: plan.currency,
        countryCode: plan.countryCode,
      }),
    [tier, deliveryDays.length, plan],
  );

  /** The date the first box actually lands on — derived, not the raw input. */
  const firstDelivery = useMemo(() => {
    if (!startDate || deliveryDays.length === 0) return null;
    return (
      buildSchedule(
        {
          startDate,
          deliveryDays,
          slots,
          skippedDates: [],
          pausedUntil: null,
          status: "active",
        },
        now,
        { count: 1, skipCutoffHours: plan.skipCutoffHours },
      )[0] ?? null
    );
  }, [startDate, deliveryDays, slots, now, plan.skipCutoffHours]);

  function chooseTier(next: PlanTier) {
    setTierId(next.id);
    // Keep the meal count honest: a tier *is* how many meals land per day.
    setSlots((cur) =>
      cur.length === next.mealsPerDay ? cur : plan.slots.slice(0, next.mealsPerDay),
    );
  }

  function toggleSlot(slot: MealSlot) {
    const perDay = tier?.mealsPerDay ?? 1;
    setSlots((cur) => {
      if (cur.includes(slot)) return cur; // Never drop below the tier's count.
      // At capacity the new pick replaces the oldest, so a one-meal tier
      // behaves exactly like a radio group.
      return cur.length >= perDay ? [...cur.slice(1), slot] : [...cur, slot];
    });
  }

  function toggleDay(day: Weekday) {
    setDeliveryDays((cur) =>
      cur.includes(day)
        ? cur.filter((d) => d !== day)
        : plan.deliveryDays.filter((d) => d === day || cur.includes(d)),
    );
  }

  function handleSubmit() {
    if (!tier) return;
    const next: FieldErrors = {};

    if (!startDate) next.start = "errors.startRequired";
    else if (startDate < earliestStart) next.start = "errors.startTooSoon";
    if (deliveryDays.length < MIN_DELIVERY_DAYS) next.days = "errors.tooFewDays";

    let address: DeliveryAddress | null = null;
    if (showSavedList) {
      const saved = savedAddrs.find((a) => a.id === activeAddressId);
      if (!saved) next.address = "errors.selectAddress";
      else address = toDeliveryAddress(saved);
    } else {
      if (!newAddress.recipient.trim()) next.recipient = "errors.nameRequired";
      if (!newAddress.line1.trim()) next.line1 = "errors.line1Required";
      if (!newAddress.area.trim()) next.area = "errors.areaRequired";
      if (!newAddress.city.trim()) next.city = "errors.cityRequired";
      if (!next.recipient && !next.line1 && !next.area && !next.city) {
        address = {
          label: newAddress.label.trim() || "Address",
          recipient: newAddress.recipient.trim(),
          phone: newAddress.phone.trim() || user?.phone || "",
          line1: newAddress.line1.trim(),
          line2: newAddress.line2.trim() || null,
          area: newAddress.area.trim(),
          city: newAddress.city.trim(),
          countryCode: plan.countryCode,
          instructions: newAddress.instructions.trim() || null,
        };
      }
    }

    setErrors(next);
    if (Object.keys(next).length > 0 || !address) {
      toast.error(t("errors.generic"));
      return;
    }

    setSubmitting(true);
    createSubscription({
      userId: user?.id ?? null,
      plan: toPlanRef(plan, vendor),
      tier,
      slots,
      deliveryDays,
      startDate,
      deliveryWindow,
      address,
      notes: notes.trim() || null,
      pricing,
      earliestStart,
    }).then((res) => {
      if (res.error || !res.data) {
        setSubmitting(false);
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      addSubscription(res.data);
      toast.success(t("startedToast", { name: plan.name }));
      router.push(`/account/subscriptions?new=${res.data.id}`);
    });
  }

  const dateLabel = (key: string) =>
    fromDateKey(key).toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

  if (!tier) {
    return (
      <div className="container-site py-16 text-center text-body">{t("noTiers")}</div>
    );
  }

  return (
    <div className="container-site py-8">
      <div className="mb-6">
        <Link
          href={`/meal-plans/${plan.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t("backToPlan", { name: plan.name })}
        </Link>
        <h1 className="mt-1 text-h1 text-ink">{t("buildTitle")}</h1>
        <p className="text-sm text-muted">{t("buildSubtitle", { name: plan.name })}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Tier */}
          <Section title={t("tierTitle")} icon={Repeat} hint={t("tierHint")}>
            <div className="space-y-3">
              {tiers.map((option) => {
                const active = option.id === tier.id;
                const perCycle = computeSubscriptionPricing({
                  pricePerMeal: option.pricePerMeal,
                  mealsPerDay: option.mealsPerDay,
                  deliveryDaysPerWeek: deliveryDays.length,
                  cycle: option.cycle,
                  discountRate: option.discountRate,
                  deliveryFeePerDay: plan.deliveryFeePerDay,
                  currency: plan.currency,
                  countryCode: plan.countryCode,
                });
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseTier(option)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-field border p-4 text-start transition-colors",
                      active ? "border-primary bg-primary/5" : "border-line hover:bg-surface-muted",
                    )}
                  >
                    <RadioDot active={active} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                          {option.name}
                          {option.isPopular && (
                            <span className="rounded-pill bg-accent-50 px-2 py-0.5 text-xs font-bold text-accent-600">
                              {t("popular")}
                            </span>
                          )}
                        </span>
                        <span className="text-sm font-bold text-ink">
                          {formatPrice(perCycle.total, currency)}
                          <span className="text-xs font-normal text-muted">
                            {" "}
                            / {t(`cycleUnit.${option.cycle}`)}
                          </span>
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {t("tierLine", {
                          meals: option.mealsPerDay,
                          price: formatPrice(perCycle.effectivePerMeal, currency),
                        })}
                        {option.discountRate > 0 &&
                          ` · ${t("saveRate", { rate: Math.round(option.discountRate * 100) })}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Which meals */}
          <Section
            title={t("mealsTitle")}
            icon={UtensilsCrossed}
            hint={t("mealsHint", { count: tier.mealsPerDay })}
          >
            <div className="flex flex-wrap gap-2">
              {MEAL_SLOTS.filter((slot) => plan.slots.includes(slot)).map((slot) => (
                <Chip
                  key={slot}
                  active={slots.includes(slot)}
                  onClick={() => toggleSlot(slot)}
                >
                  {t(`slot.${slot}`)}
                </Chip>
              ))}
            </div>
          </Section>

          {/* Days */}
          <Section
            title={t("daysTitle")}
            icon={CalendarDays}
            hint={t("daysHint", { count: MIN_DELIVERY_DAYS })}
            error={errors.days && t(errors.days)}
          >
            <div className="flex flex-wrap gap-2">
              {plan.deliveryDays.map((day) => (
                <Chip
                  key={day}
                  active={deliveryDays.includes(day)}
                  onClick={() => toggleDay(day)}
                >
                  <DayLabel day={day} />
                </Chip>
              ))}
            </div>
          </Section>

          {/* Start + window */}
          <Section title={t("startTitle")} icon={Clock}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="sub-start"
                label={t("startDate")}
                error={errors.start && t(errors.start)}
                hint={t("leadTimeHint", { count: plan.leadTimeDays })}
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="date"
                    min={earliestStart}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    aria-invalid={!!errors.start}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
              <Field id="sub-window" label={t("deliveryWindow")}>
                {({ id }) => (
                  <select
                    id={id}
                    value={deliveryWindow}
                    onChange={(e) => setDeliveryWindow(e.target.value)}
                    className="h-11 w-full rounded-field border border-line bg-surface px-3.5 text-sm text-ink outline-none transition-colors focus:border-primary"
                  >
                    {MEAL_SLOTS.map((slot) => (
                      <option key={slot} value={DELIVERY_WINDOWS[slot]}>
                        {DELIVERY_WINDOWS[slot]} · {t(`slot.${slot}`)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </Section>

          {/* Address */}
          <Section title={t("addressTitle")} icon={MapPin} error={errors.address && t(errors.address)}>
            {savedAddrs.length > 0 && (
              <div className="mb-4 flex gap-2">
                <Chip active={addressMode === "saved"} onClick={() => setAddressMode("saved")}>
                  {t("savedAddress")}
                </Chip>
                <Chip active={addressMode === "new"} onClick={() => setAddressMode("new")}>
                  {t("newAddress")}
                </Chip>
              </div>
            )}

            {showSavedList ? (
              <div className="space-y-2.5">
                {savedAddrs.map((address) => {
                  const active = address.id === activeAddressId;
                  return (
                    <button
                      key={address.id}
                      type="button"
                      onClick={() => setSelectedAddressId(address.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-field border p-4 text-start transition-colors",
                        active ? "border-primary bg-primary/5" : "border-line hover:bg-surface-muted",
                      )}
                    >
                      <RadioDot active={active} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">
                          {address.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {address.line1}
                          {address.line2 ? `, ${address.line2}` : ""}, {address.area},{" "}
                          {address.city}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <AddressFields
                value={newAddress}
                onChange={(patch) => setNewAddress((cur) => ({ ...cur, ...patch }))}
                errors={{
                  recipient: errors.recipient,
                  line1: errors.line1,
                  area: errors.area,
                  city: errors.city,
                }}
              />
            )}
          </Section>

          {/* Kitchen notes */}
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
            <p className="mt-0.5 text-xs text-muted">{plan.name}</p>

            <dl className="mt-4 space-y-2 border-b border-line pb-4 text-sm">
              <SummaryRow label={t("summaryTier")} value={tier.name} />
              <SummaryRow
                label={t("summaryMeals")}
                value={slots.map((slot) => t(`slot.${slot}`)).join(" · ")}
              />
              <SummaryRow
                label={t("summaryDays")}
                value={t("daysPerWeek", { count: deliveryDays.length })}
              />
              <SummaryRow
                label={t("summaryFirst")}
                value={firstDelivery ? dateLabel(firstDelivery.date) : t("summaryPending")}
              />
              <SummaryRow label={t("summaryWindow")} value={deliveryWindow} />
            </dl>

            <dl className="space-y-2 py-4 text-sm">
              <SummaryRow
                label={t("lineMeals", {
                  count: pricing.mealCount,
                  price: formatPrice(pricing.pricePerMeal, currency),
                })}
                value={formatPrice(pricing.subtotal, currency)}
              />
              {pricing.discount > 0 && (
                <SummaryRow
                  label={t("lineDiscount", {
                    rate: Math.round(pricing.discountRate * 100),
                  })}
                  value={`− ${formatPrice(pricing.discount, currency)}`}
                />
              )}
              <SummaryRow
                label={t("lineDelivery")}
                value={
                  pricing.deliveryFee === 0
                    ? t("free")
                    : formatPrice(pricing.deliveryFee, currency)
                }
              />
              <SummaryRow label={pricing.taxLabel} value={formatPrice(pricing.tax, currency)} />
            </dl>

            <div className="flex items-center justify-between border-t border-line pt-4 text-base font-bold text-ink">
              <span>{t(`totalPer.${tier.cycle}`)}</span>
              <span>{formatPrice(pricing.total, currency)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {t("effectivePerMeal", {
                price: formatPrice(pricing.effectivePerMeal, currency),
              })}
            </p>

            {authHydrated && !user ? (
              <Link
                href={`/login?next=/meal-plans/${plan.slug}/subscribe`}
                className="mt-5 inline-flex h-13 w-full items-center justify-center rounded-pill bg-primary px-6 text-base font-semibold text-white transition-colors hover:bg-primary-600"
              >
                {t("signInToSubscribe")}
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !authHydrated}
                className="mt-5 inline-flex h-13 w-full items-center justify-center rounded-pill bg-primary px-6 text-base font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
              >
                {submitting ? t("starting") : t("startPlan")}
              </button>
            )}
            <p className="mt-3 text-center text-xs text-muted">{t("noChargeNote")}</p>
            <p className="mt-1 text-center text-xs text-muted">{t("cancelAnytime")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Short weekday label from the shared `days` catalog. */
function DayLabel({ day }: { day: Weekday }) {
  const td = useTranslations("days");
  return <>{td(day)}</>;
}

function Section({
  title,
  icon: Icon,
  hint,
  error,
  children,
}: {
  title: string;
  icon?: typeof MapPin;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 text-h3 text-ink">
        {Icon && <Icon className="size-5 text-primary" aria-hidden />}
        {title}
      </h2>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
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

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
        active ? "border-primary" : "border-line",
      )}
    >
      <span
        className={cn(
          "size-2.5 rounded-full transition-colors",
          active ? "bg-primary" : "bg-transparent",
        )}
      />
    </span>
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
