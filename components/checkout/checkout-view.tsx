"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Bike, Check, Clock, MapPin, Pencil, Store } from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { DeliveryAddress, PaymentMethod, SavedAddress } from "@/types";
import { useCart } from "@/stores/cart";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { useAddresses } from "@/stores/addresses";
import { placeOrder } from "@/services/orders";
import { getAddressBook } from "@/services/account";
import { amountToMinOrder, cartSubtotal } from "@/lib/cart";
import { computeTotals, evaluatePromo, type Promo } from "@/lib/checkout";
import { formatPrice } from "@/lib/format";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OrderSummary } from "@/components/checkout/order-summary";
import { PaymentMethods, DEMO_CARD_LAST4 } from "@/components/checkout/payment-methods";
import { AddressFields, emptyAddress, type NewAddress } from "@/components/checkout/address-fields";
import { cn } from "@/lib/utils";

type Fulfillment = "delivery" | "pickup";
type AddressMode = "saved" | "new";
type TimeMode = "asap" | "schedule";
type FieldErrors = Partial<Record<
  "contactName" | "contactPhone" | "address" | "recipient" | "line1" | "area" | "city" | "time",
  string
>>;

const HALF_HOUR = 30 * 60_000;

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
 * CheckoutView — the checkout experience (Phase C8). Reads the persisted cart,
 * collects fulfillment / address / time / payment / notes, computes the live
 * total, then calls the simulated `placeOrder` service, commits the returned
 * order to the orders store and routes to the confirmation screen. Frontend
 * only: no real payment is taken.
 */
export function CheckoutView() {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const router = useRouter();

  const vendor = useCart((s) => s.vendor);
  const lines = useCart((s) => s.lines);
  const hydrated = useCart((s) => s.hydrated);
  const clearCart = useCart((s) => s.clear);
  const openCart = useCart((s) => s.open);
  const user = useAuth((s) => s.user);
  const addOrder = useOrders((s) => s.addOrder);
  // Address book comes from the shared persisted store (Phase C3), so addresses
  // added/edited in the account app are available here too.
  const savedAddrs = useAddresses((s) => s.addresses);
  const addrHydrated = useAddresses((s) => s.hydrated);
  const addrSeeded = useAddresses((s) => s.seeded);
  const seedAddrs = useAddresses((s) => s.seed);

  // Rehydrate the persisted stores on the client (they skip auto-hydration).
  useEffect(() => {
    useCart.persist.rehydrate();
    useOrders.persist.rehydrate();
    useAuth.persist.rehydrate();
    useAddresses.persist.rehydrate();
  }, []);

  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [addressMode, setAddressMode] = useState<AddressMode>("saved");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [newAddress, setNewAddress] = useState<NewAddress>(emptyAddress);
  // Contact fields default to the signed-in user (derived, so no effect is
  // needed when the session rehydrates); `null` means "not yet edited".
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState<string | null>(null);
  const contactName = nameInput ?? user?.name ?? "";
  const contactPhone = phoneInput ?? user?.phone ?? "";
  const [timeMode, setTimeMode] = useState<TimeMode>("asap");
  const [scheduledSlot, setScheduledSlot] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [tipPercent, setTipPercent] = useState(0);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<Promo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Seed the address book once from the service if it's still empty.
  useEffect(() => {
    if (addrHydrated && !addrSeeded) getAddressBook().then(seedAddrs);
  }, [addrHydrated, addrSeeded, seedAddrs]);

  // The selected address is derived: until the user picks one, it defaults to
  // the book's default (or first) entry — no effect / setState needed.
  const defaultAddressId = savedAddrs.find((a) => a.isDefault)?.id ?? savedAddrs[0]?.id ?? "";
  const activeAddressId = selectedAddressId || defaultAddressId;
  // Fall back to the manual form when there's nothing to pick from.
  const showSavedList = addressMode === "saved" && savedAddrs.length > 0;

  // Generate scheduling slots (client-only) starting ~45 min out, on the half hour.
  const [slots] = useState(() => {
    const start = Math.ceil((Date.now() + 45 * 60_000) / HALF_HOUR) * HALF_HOUR;
    return Array.from({ length: 10 }, (_, i) => new Date(start + i * HALF_HOUR).toISOString());
  });

  const subtotal = cartSubtotal(lines);
  const toMin = vendor ? amountToMinOrder(vendor, subtotal) : 0;
  const belowMin = fulfillment === "delivery" && toMin > 0;

  const pricing = useMemo(
    () =>
      vendor
        ? computeTotals({ vendor, lines, tipPercent, promo: appliedPromo, fulfillment })
        : null,
    [vendor, lines, tipPercent, appliedPromo, fulfillment],
  );

  // ---- Loading / empty states (all hooks above run unconditionally) ----
  if (!hydrated) {
    return (
      <div className="container-site flex min-h-[50vh] items-center justify-center py-16">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  if (!vendor || lines.length === 0 || !pricing) {
    return (
      <div className="container-site flex min-h-[50vh] flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <MapPin className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">{t("empty")}</h1>
        <p className="text-body">{t("emptyHint")}</p>
        <Link
          href="/restaurants"
          className="mt-2 inline-flex h-11 items-center rounded-pill bg-primary px-6 font-semibold text-white hover:bg-primary-600"
        >
          {t("browseRestaurants")}
        </Link>
      </div>
    );
  }

  const currency = vendor.currency as CurrencyCode;

  function applyPromo() {
    const res = evaluatePromo(promoInput, subtotal);
    setPromoError(res.errorKey);
    setAppliedPromo(res.promo);
  }

  function handlePlaceOrder() {
    if (!vendor || !pricing) return;
    const next: FieldErrors = {};

    if (!contactName.trim()) next.contactName = "errors.nameRequired";
    if (contactPhone.trim().length < 6) next.contactPhone = "errors.phoneInvalid";

    let address: DeliveryAddress | null = null;
    if (fulfillment === "delivery") {
      if (showSavedList) {
        const sa = savedAddrs.find((a) => a.id === activeAddressId);
        if (!sa) next.address = "errors.selectAddress";
        else address = toDeliveryAddress(sa);
      } else {
        if (!newAddress.recipient.trim()) next.recipient = "errors.nameRequired";
        if (!newAddress.line1.trim()) next.line1 = "errors.line1Required";
        if (!newAddress.area.trim()) next.area = "errors.areaRequired";
        if (!newAddress.city.trim()) next.city = "errors.cityRequired";
        if (!next.recipient && !next.line1 && !next.area && !next.city) {
          address = {
            label: newAddress.label.trim() || "Address",
            recipient: newAddress.recipient.trim(),
            phone: newAddress.phone.trim() || contactPhone.trim(),
            line1: newAddress.line1.trim(),
            line2: newAddress.line2.trim() || null,
            area: newAddress.area.trim(),
            city: newAddress.city.trim(),
            countryCode: vendor.countryCode ?? "BD",
            instructions: newAddress.instructions.trim() || null,
          };
        }
      }
    }

    if (timeMode === "schedule" && !scheduledSlot) next.time = "errors.selectTime";

    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error(t("errors.generic"));
      return;
    }

    setSubmitting(true);
    placeOrder({
      vendor,
      lines,
      fulfillment,
      address,
      scheduledFor: timeMode === "schedule" ? scheduledSlot : null,
      contact: { name: contactName.trim(), phone: contactPhone.trim() },
      notes: notes.trim() || null,
      payment: { method: payment, cardLast4: payment === "card" ? DEMO_CARD_LAST4 : null },
      pricing,
    }).then((res) => {
      if (res.error || !res.data) {
        setSubmitting(false);
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      const order = res.data;
      addOrder(order);
      clearCart();
      router.push(`/checkout/success?order=${order.id}`);
    });
  }

  const fmtSlot = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="container-site py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/restaurants/${vendor.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("backToCart")}
          </Link>
          <h1 className="mt-1 text-h1 text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("fromVendor", { vendor: vendor.name })}</p>
        </div>
        <button
          type="button"
          onClick={openCart}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted"
        >
          <Pencil className="size-4" aria-hidden /> {t("editCart")}
        </button>
      </div>

      {belowMin && (
        <p className="mb-6 rounded-panel border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-medium text-body">
          {t("belowMinNotice", {
            min: formatPrice(vendor.minOrder, currency),
            amount: formatPrice(toMin, currency),
          })}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left: form */}
        <div className="space-y-6">
          {/* Fulfillment */}
          <Section title={t("fulfillmentTitle")}>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { key: "delivery", icon: Bike, title: t("delivery"), desc: t("deliveryDesc") },
                  { key: "pickup", icon: Store, title: t("pickup"), desc: t("pickupDesc") },
                ] as const
              ).map(({ key, icon: Icon, title, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFulfillment(key)}
                  aria-pressed={fulfillment === key}
                  className={cn(
                    "flex items-start gap-3 rounded-field border p-4 text-start transition-colors",
                    fulfillment === key
                      ? "border-primary bg-primary/5"
                      : "border-line hover:bg-surface-muted",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-10 shrink-0 items-center justify-center rounded-field",
                      fulfillment === key ? "bg-primary text-white" : "bg-surface-muted text-muted",
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{title}</span>
                    <span className="block text-xs text-muted">{desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </Section>

          {/* Address (delivery only) */}
          {fulfillment === "delivery" && (
            <Section title={t("addressTitle")} icon={MapPin}>
              {showSavedList ? (
                <div className="space-y-3">
                  <ul className="space-y-2">
                    {savedAddrs.map((addr) => {
                      const active = addr.id === activeAddressId;
                      return (
                        <li key={addr.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedAddressId(addr.id)}
                            aria-pressed={active}
                            className={cn(
                              "flex w-full items-start gap-3 rounded-field border p-4 text-start transition-colors",
                              active ? "border-primary bg-primary/5" : "border-line hover:bg-surface-muted",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                                active ? "border-primary bg-primary text-white" : "border-line text-transparent",
                              )}
                            >
                              <Check className="size-3.5" aria-hidden />
                            </span>
                            <span className="min-w-0">
                              <span className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-ink">{addr.label}</span>
                                {addr.isDefault && (
                                  <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted">
                                    ★
                                  </span>
                                )}
                              </span>
                              <span className="block text-sm text-body">
                                {addr.line1}
                                {addr.line2 ? `, ${addr.line2}` : ""}, {addr.area}, {addr.city}
                              </span>
                              <span className="block text-xs text-muted">{addr.recipient} · {addr.phone}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {errors.address && (
                    <p className="text-xs font-medium text-danger">{t(errors.address)}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setAddressMode("new")}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    {t("addNewAddress")}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <AddressFields
                    value={newAddress}
                    onChange={(patch) => setNewAddress((v) => ({ ...v, ...patch }))}
                    errors={{
                      recipient: errors.recipient,
                      line1: errors.line1,
                      area: errors.area,
                      city: errors.city,
                    }}
                  />
                  {savedAddrs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAddressMode("saved")}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      {t("useSavedAddress")}
                    </button>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* Contact */}
          <Section title={t("contactTitle")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="contact-name" label={t("contactName")} error={errors.contactName && t(errors.contactName)}>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    value={contactName}
                    onChange={(e) => setNameInput(e.target.value)}
                    autoComplete="name"
                    aria-invalid={!!errors.contactName}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
              <Field id="contact-phone" label={t("contactPhone")} error={errors.contactPhone && t(errors.contactPhone)}>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="tel"
                    inputMode="tel"
                    value={contactPhone}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    autoComplete="tel"
                    placeholder="+8801XXXXXXXXX"
                    aria-invalid={!!errors.contactPhone}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
            </div>
          </Section>

          {/* Time */}
          <Section title={t("timeTitle")} icon={Clock}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { key: "asap", title: t("asap"), desc: t("asapHint") },
                    { key: "schedule", title: t("schedule"), desc: t("pickTime") },
                  ] as const
                ).map(({ key, title, desc }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTimeMode(key)}
                    aria-pressed={timeMode === key}
                    className={cn(
                      "rounded-field border p-3 text-start transition-colors",
                      timeMode === key ? "border-primary bg-primary/5" : "border-line hover:bg-surface-muted",
                    )}
                  >
                    <span className="block text-sm font-semibold text-ink">{title}</span>
                    <span className="block text-xs text-muted">{desc}</span>
                  </button>
                ))}
              </div>
              {timeMode === "schedule" && (
                <div>
                  <select
                    value={scheduledSlot}
                    onChange={(e) => setScheduledSlot(e.target.value)}
                    aria-invalid={!!errors.time}
                    className="h-11 w-full rounded-field border border-line bg-surface px-3.5 text-sm text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 aria-[invalid=true]:border-danger"
                  >
                    <option value="">{t("pickTime")}</option>
                    {slots.map((iso) => (
                      <option key={iso} value={iso}>
                        {fmtSlot(iso)}
                      </option>
                    ))}
                  </select>
                  {errors.time && <p className="mt-1.5 text-xs font-medium text-danger">{t(errors.time)}</p>}
                </div>
              )}
            </div>
          </Section>

          {/* Payment */}
          <Section title={t("paymentTitle")}>
            <PaymentMethods value={payment} onChange={setPayment} currency={currency} />
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

        {/* Right: summary */}
        <OrderSummary
          vendor={vendor}
          lines={lines}
          pricing={pricing}
          tipPercent={tipPercent}
          onTipChange={setTipPercent}
          promoInput={promoInput}
          onPromoInputChange={setPromoInput}
          appliedPromo={appliedPromo}
          promoError={promoError}
          onApplyPromo={applyPromo}
          onRemovePromo={() => {
            setAppliedPromo(null);
            setPromoInput("");
            setPromoError(null);
          }}
          onPlaceOrder={handlePlaceOrder}
          submitting={submitting}
          disabled={belowMin}
        />
      </div>
    </div>
  );
}

/** A titled panel used for each checkout step. */
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
