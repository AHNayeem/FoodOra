"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import type {
  CateringAddOn,
  CateringPackage,
  CateringService,
  EventType,
  QuoteService,
  ServiceStyle,
} from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { useAuth } from "@/frontend/stores/auth";
import { useCatering } from "@/frontend/stores/catering";
import { requestQuote } from "@/frontend/services/catering";
import { estimateQuote, toAddOnLine, EVENT_TYPE_EMOJI } from "@/frontend/lib/catering";
import { formatPrice } from "@/frontend/lib/format";
import { Field } from "@/frontend/components/ui/field";
import { Input } from "@/frontend/components/ui/input";
import { cn } from "@/frontend/lib/utils";

type FieldKey =
  | "date"
  | "guests"
  | "contactName"
  | "contactPhone"
  | "contactEmail"
  | "city"
  | "area";
type FieldErrors = Partial<Record<FieldKey, string>>;

const GUEST_STEP = 10;

function toDateInput(d: Date): string {
  // Local YYYY-MM-DD (avoids the UTC shift `toISOString` would introduce).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * CateringQuoteBuilder — the catering request flow (Phase C17): custom
 * quotation + package builder + calendar booking on one page. Reads the caterer,
 * its packages and add-ons (resolved server-side), collects the event brief,
 * shows a live estimate, then calls the simulated `requestQuote`, commits the
 * returned quote to the quotes store and routes to the confirmation/status page.
 * Frontend only: the estimate is indicative — the caterer confirms final pricing.
 */
export function CateringQuoteBuilder({
  service,
  packages,
  addOns,
  initialPackageId,
}: {
  service: CateringService;
  packages: CateringPackage[];
  addOns: CateringAddOn[];
  initialPackageId: string | null;
}) {
  const t = useTranslations("catering");
  const locale = useLocale();
  const router = useRouter();
  const currency = service.currency as CurrencyCode;

  const initialPackage = packages.find((p) => p.id === initialPackageId) ?? null;

  const user = useAuth((s) => s.user);
  const addQuote = useCatering((s) => s.addQuote);

  useEffect(() => {
    useAuth.persist.rehydrate();
    useCatering.persist.rehydrate();
  }, []);

  const [eventType, setEventType] = useState<EventType>(
    initialPackage?.eventType ?? service.eventTypes[0],
  );
  const [packageId, setPackageId] = useState<string | null>(initialPackage?.id ?? null);
  const [serviceStyle, setServiceStyle] = useState<ServiceStyle>(
    initialPackage?.serviceStyle ?? service.serviceStyles[0],
  );
  const [eventDate, setEventDate] = useState("");
  const [guests, setGuests] = useState(initialPackage?.minGuests ?? service.minGuests);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [city, setCity] = useState("Dhaka");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  // Contact fields derive from the signed-in user until edited (`null` = unedited).
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const contactName = nameInput ?? user?.name ?? "";
  const contactPhone = phoneInput ?? user?.phone ?? "";
  const contactEmail = emailInput ?? user?.email ?? "";

  // Minimum bookable date = today + the caterer's lead time (client-only).
  const [minDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + service.leadTimeDays);
    return toDateInput(d);
  });

  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;
  const packagesForEvent = packages.filter((p) => p.eventType === eventType);
  const minGuests = selectedPackage?.minGuests ?? service.minGuests;
  const pricePerGuest = selectedPackage?.pricePerGuest ?? service.pricePerGuestFrom;

  const selectedAddOns = useMemo(
    () => addOns.filter((a) => addOnIds.includes(a.id)),
    [addOns, addOnIds],
  );

  const pricing = useMemo(() => {
    const lines = selectedAddOns.map((a) => toAddOnLine(a, guests));
    return estimateQuote({
      pricePerGuest,
      guests,
      addOns: lines,
      currency,
      countryCode: service.location.countryCode,
    });
  }, [selectedAddOns, guests, pricePerGuest, currency, service.location.countryCode]);

  function setGuestsClamped(next: number) {
    if (Number.isNaN(next)) return setGuests(minGuests);
    setGuests(Math.min(service.maxGuests, Math.max(minGuests, next)));
  }

  function chooseEvent(et: EventType) {
    setEventType(et);
    // Drop a package that doesn't belong to the newly chosen event type.
    if (selectedPackage && selectedPackage.eventType !== et) setPackageId(null);
  }

  function choosePackage(pkg: CateringPackage | null) {
    if (!pkg) {
      setPackageId(null);
      return;
    }
    setPackageId(pkg.id);
    setServiceStyle(pkg.serviceStyle);
    if (guests < pkg.minGuests) setGuests(pkg.minGuests);
  }

  function toggleAddOn(id: string) {
    setAddOnIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function handleSubmit() {
    const next: FieldErrors = {};
    if (!eventDate) next.date = "errors.dateRequired";
    else if (eventDate < minDate) next.date = "errors.dateTooSoon";
    if (guests < minGuests || guests > service.maxGuests) next.guests = "errors.guestsRange";
    if (!contactName.trim()) next.contactName = "errors.nameRequired";
    if (contactPhone.trim().length < 6) next.contactPhone = "errors.phoneInvalid";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) next.contactEmail = "errors.emailInvalid";
    if (!city.trim()) next.city = "errors.cityRequired";
    if (!area.trim()) next.area = "errors.areaRequired";

    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error(t("errors.generic"));
      return;
    }

    const quoteService: QuoteService = {
      id: service.id,
      slug: service.slug,
      name: service.name,
      currency: service.currency,
      countryCode: service.location.countryCode,
    };

    setSubmitting(true);
    requestQuote({
      service: quoteService,
      packageId: selectedPackage?.id ?? null,
      packageName: selectedPackage?.name ?? null,
      eventType,
      serviceStyle,
      eventDate,
      guests,
      venue: { city: city.trim(), area: area.trim(), address: address.trim() || null },
      contact: {
        name: contactName.trim(),
        phone: contactPhone.trim(),
        email: contactEmail.trim(),
        company: company.trim() || null,
      },
      addOns: selectedAddOns.map((a) => toAddOnLine(a, guests)),
      notes: notes.trim() || null,
      pricing,
    }).then((res) => {
      if (res.error || !res.data) {
        setSubmitting(false);
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      addQuote(res.data);
      router.push(`/catering/quotes/${res.data.id}`);
    });
  }

  const dateLabel = eventDate
    ? new Date(`${eventDate}T00:00:00`).toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : t("summaryDatePending");

  return (
    <div className="container-site py-8">
      <div className="mb-6">
        <Link
          href={`/catering/${service.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t("backToService", { name: service.name })}
        </Link>
        <h1 className="mt-1 text-h1 text-ink">{t("requestQuoteTitle")}</h1>
        <p className="text-sm text-muted">{t("requestQuoteSubtitle", { name: service.name })}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left: the event brief */}
        <div className="space-y-6">
          {/* Event type */}
          <Section title={t("eventTypeTitle")} icon={Sparkles}>
            <div className="flex flex-wrap gap-2">
              {service.eventTypes.map((et) => (
                <Chip key={et} active={eventType === et} onClick={() => chooseEvent(et)}>
                  <span aria-hidden>{EVENT_TYPE_EMOJI[et]}</span>
                  {t(`event.${et}`)}
                </Chip>
              ))}
            </div>
          </Section>

          {/* Date + guests */}
          <Section title={t("dateGuestsTitle")} icon={CalendarDays}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="event-date" label={t("eventDate")} error={errors.date && t(errors.date)} hint={t("leadTimeHint", { count: service.leadTimeDays })}>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="date"
                    min={minDate}
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    aria-invalid={!!errors.date}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
              <Field id="event-guests" label={t("guests")} error={errors.guests && t(errors.guests)} hint={t("guestBounds", { min: minGuests, max: service.maxGuests })}>
                {({ id, describedBy }) => (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setGuestsClamped(guests - GUEST_STEP)}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-field border border-line text-ink transition-colors hover:bg-surface-muted disabled:opacity-40"
                      disabled={guests <= minGuests}
                      aria-label={t("decreaseGuests")}
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <Input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={minGuests}
                      max={service.maxGuests}
                      value={guests}
                      onChange={(e) => setGuestsClamped(parseInt(e.target.value, 10))}
                      aria-invalid={!!errors.guests}
                      aria-describedby={describedBy}
                      className="text-center"
                    />
                    <button
                      type="button"
                      onClick={() => setGuestsClamped(guests + GUEST_STEP)}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-field border border-line text-ink transition-colors hover:bg-surface-muted disabled:opacity-40"
                      disabled={guests >= service.maxGuests}
                      aria-label={t("increaseGuests")}
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                )}
              </Field>
            </div>
          </Section>

          {/* Package builder */}
          <Section title={t("packageTitle")} icon={UtensilsCrossed}>
            {packagesForEvent.length === 0 ? (
              <p className="text-sm text-muted">{t("noPackagesForEvent")}</p>
            ) : (
              <div className="space-y-3">
                {packagesForEvent.map((pkg) => {
                  const active = packageId === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => choosePackage(pkg)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-field border p-4 text-start transition-colors",
                        active ? "border-primary bg-primary/5" : "border-line hover:bg-surface-muted",
                      )}
                    >
                      <RadioDot active={active} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">{pkg.name}</span>
                          <span className="text-sm font-bold text-ink">
                            {formatPrice(pkg.pricePerGuest, currency)}
                            <span className="text-xs font-normal text-muted"> / {t("guestUnit")}</span>
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {t(`style.${pkg.serviceStyle}`)} · {t("minGuestsShort", { count: pkg.minGuests })}
                        </span>
                        <span className="mt-1 block text-xs text-body line-clamp-2">
                          {pkg.courses.join(" · ")}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {/* Custom / no package */}
                <button
                  type="button"
                  onClick={() => choosePackage(null)}
                  aria-pressed={packageId === null}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-field border border-dashed p-4 text-start transition-colors",
                    packageId === null ? "border-primary bg-primary/5" : "border-line hover:bg-surface-muted",
                  )}
                >
                  <RadioDot active={packageId === null} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{t("customMenuTitle")}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {t("customMenuHint", { price: formatPrice(service.pricePerGuestFrom, currency) })}
                    </span>
                  </span>
                </button>
              </div>
            )}
          </Section>

          {/* Service style */}
          <Section title={t("styleTitle")}>
            <div className="flex flex-wrap gap-2">
              {service.serviceStyles.map((st) => (
                <Chip key={st} active={serviceStyle === st} onClick={() => setServiceStyle(st)}>
                  {t(`style.${st}`)}
                </Chip>
              ))}
            </div>
          </Section>

          {/* Add-ons */}
          {addOns.length > 0 && (
            <Section title={t("addOnsTitle")} icon={Plus}>
              <p className="-mt-2 mb-4 text-xs text-muted">{t("addOnsHint")}</p>
              <div className="space-y-2.5">
                {addOns.map((addOn) => {
                  const active = addOnIds.includes(addOn.id);
                  return (
                    <button
                      key={addOn.id}
                      type="button"
                      onClick={() => toggleAddOn(addOn.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-field border p-4 text-start transition-colors",
                        active ? "border-primary bg-primary/5" : "border-line hover:bg-surface-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                          active ? "border-primary bg-primary text-white" : "border-line text-transparent",
                        )}
                      >
                        <Check className="size-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">{addOn.name}</span>
                          <span className="text-sm font-semibold text-ink">
                            {formatPrice(addOn.price, currency)}
                            <span className="text-xs font-normal text-muted">
                              {" "}
                              {addOn.unit === "per-guest" ? `/ ${t("guestUnit")}` : t("flatFee")}
                            </span>
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">{addOn.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Venue */}
          <Section title={t("venueTitle")} icon={MapPin}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="venue-city" label={t("city")} error={errors.city && t(errors.city)}>
                {({ id, describedBy }) => (
                  <Input id={id} value={city} onChange={(e) => setCity(e.target.value)} aria-invalid={!!errors.city} aria-describedby={describedBy} />
                )}
              </Field>
              <Field id="venue-area" label={t("area")} error={errors.area && t(errors.area)}>
                {({ id, describedBy }) => (
                  <Input id={id} value={area} onChange={(e) => setArea(e.target.value)} aria-invalid={!!errors.area} aria-describedby={describedBy} placeholder={t("areaPlaceholder")} />
                )}
              </Field>
              <Field id="venue-address" label={t("venueAddress")} className="sm:col-span-2">
                {({ id }) => (
                  <Input id={id} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("venueAddressPlaceholder")} />
                )}
              </Field>
            </div>
          </Section>

          {/* Contact */}
          <Section title={t("contactTitle")} icon={Building2}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="contact-name" label={t("contactName")} error={errors.contactName && t(errors.contactName)}>
                {({ id, describedBy }) => (
                  <Input id={id} value={contactName} onChange={(e) => setNameInput(e.target.value)} autoComplete="name" aria-invalid={!!errors.contactName} aria-describedby={describedBy} />
                )}
              </Field>
              <Field id="contact-company" label={t("company")}>
                {({ id }) => (
                  <Input id={id} value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" placeholder={t("companyPlaceholder")} />
                )}
              </Field>
              <Field id="contact-phone" label={t("contactPhone")} error={errors.contactPhone && t(errors.contactPhone)}>
                {({ id, describedBy }) => (
                  <Input id={id} type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setPhoneInput(e.target.value)} autoComplete="tel" placeholder="+8801XXXXXXXXX" aria-invalid={!!errors.contactPhone} aria-describedby={describedBy} />
                )}
              </Field>
              <Field id="contact-email" label={t("contactEmail")} error={errors.contactEmail && t(errors.contactEmail)}>
                {({ id, describedBy }) => (
                  <Input id={id} type="email" inputMode="email" value={contactEmail} onChange={(e) => setEmailInput(e.target.value)} autoComplete="email" aria-invalid={!!errors.contactEmail} aria-describedby={describedBy} />
                )}
              </Field>
            </div>
          </Section>

          {/* Notes */}
          <Section title={t("notesTitle")}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("notesPlaceholder")}
              className="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </Section>
        </div>

        {/* Right: live estimate */}
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="rounded-panel border border-line bg-surface p-6 shadow-card">
            <h2 className="text-h3 text-ink">{t("estimateTitle")}</h2>
            <p className="mt-0.5 text-xs text-muted">{service.name}</p>

            <dl className="mt-4 space-y-2 border-b border-line pb-4 text-sm">
              <SummaryRow label={t("summaryEvent")} value={`${EVENT_TYPE_EMOJI[eventType]} ${t(`event.${eventType}`)}`} />
              <SummaryRow label={t("summaryDate")} value={dateLabel} />
              <SummaryRow label={t("summaryGuests")} value={t("guestCount", { count: guests })} />
              <SummaryRow label={t("summaryPackage")} value={selectedPackage?.name ?? t("customMenuTitle")} />
              <SummaryRow label={t("summaryStyle")} value={t(`style.${serviceStyle}`)} />
            </dl>

            <dl className="space-y-2 py-4 text-sm">
              <SummaryRow
                label={t("estPackage", { price: formatPrice(pricing.pricePerGuest, currency), count: guests })}
                value={formatPrice(pricing.packageSubtotal, currency)}
              />
              {selectedAddOns.map((a) => {
                const line = toAddOnLine(a, guests);
                return <SummaryRow key={a.id} label={a.name} value={formatPrice(line.amount, currency)} muted />;
              })}
              <SummaryRow label={t("estServiceFee")} value={formatPrice(pricing.serviceFee, currency)} />
              <SummaryRow label={pricing.taxLabel} value={formatPrice(pricing.tax, currency)} />
            </dl>

            <div className="flex items-center justify-between border-t border-line pt-4 text-base font-bold text-ink">
              <span>{t("estTotal")}</span>
              <span>{formatPrice(pricing.total, currency)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{t("estimateDisclaimer")}</p>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="mt-5 inline-flex h-13 w-full items-center justify-center rounded-pill bg-primary px-6 text-base font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
            >
              {submitting ? t("submitting") : t("submitRequest")}
            </button>
            <p className="mt-3 text-center text-xs text-muted">{t("noPaymentNote")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** A titled panel used for each step of the brief. */
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof MapPin;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel border border-line bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-h3 text-ink">
        {Icon && <Icon className="size-5 text-primary" aria-hidden />}
        {title}
      </h2>
      {children}
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
      <span className={cn("size-2.5 rounded-full transition-colors", active ? "bg-primary" : "bg-transparent")} />
    </span>
  );
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={cn("min-w-0", muted ? "text-muted" : "text-body")}>{label}</dt>
      <dd className={cn("shrink-0 text-end font-medium", muted ? "text-muted" : "text-ink")}>{value}</dd>
    </div>
  );
}
