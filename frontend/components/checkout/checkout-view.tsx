"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Bike, Check, Clock, MapPin, Pencil, Store } from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { AppliedCoupon, DeliveryAddress, PaymentMethod, SavedAddress } from "@/types";
import type { CouponOption } from "@/lib/coupons";
import { useCart } from "@/stores/cart";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { useAddresses } from "@/stores/addresses";
import { useCoupons } from "@/stores/coupons";
import { useWallet } from "@/stores/wallet";
import { isPhoneBlocked, useCustomers } from "@/stores/customers";
import { authorisePayment, placeOrder } from "@/services/orders";
import { getAddressBook } from "@/services/account";
import { authoriseWalletPayment, getWallet } from "@/services/wallet";
import {
  applyCoupon,
  applyCouponCode,
  getBasketCoupons,
  getGrantedClaims,
  redeemCoupon,
  type BasketInput,
} from "@/services/coupons";
import { amountToMinOrder, cartSubtotal } from "@/lib/cart";
import { computeTotals } from "@/lib/checkout";
import { coversAmount } from "@/lib/wallet";
import { formatPrice } from "@/lib/format";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CouponField } from "@/components/checkout/coupon-field";
import { OrderSummary } from "@/components/checkout/order-summary";
import {
  PaymentMethods,
  DEMO_CARD_LAST4,
  DEMO_CARD_NUMBER,
} from "@/components/checkout/payment-methods";
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
  const tc = useTranslations("coupons");
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
  // Coupons (C21): the wallet is claims-only; the seam prices them per basket.
  const claims = useCoupons((s) => s.claims);
  const couponsHydrated = useCoupons((s) => s.hydrated);
  const couponsSeeded = useCoupons((s) => s.seeded);
  const seedCoupons = useCoupons((s) => s.seed);
  const addClaim = useCoupons((s) => s.addClaim);
  const recordRedemption = useCoupons((s) => s.recordRedemption);
  // The wallet is both a tender and a payee here: it can pay for the order
  // (C19) and it receives cashback afterwards (C21), so it has to be loaded
  // before either happens.
  const walletHydrated = useWallet((s) => s.hydrated);
  const walletSeeded = useWallet((s) => s.seeded);
  const seedWallet = useWallet((s) => s.seed);
  const rewardWallet = useWallet((s) => s.reward);
  const walletBalance = useWallet((s) => s.balance);
  const payFromWallet = useWallet((s) => s.pay);
  const pastOrders = useOrders((s) => s.orders);
  // Phase 11: the accounts platform moderation has acted on. Read here so that
  // blocking somebody in `/admin/customers` actually stops them ordering — a
  // block that only paints a chip on an admin table is not a block.
  const managedAccounts = useCustomers((s) => s.accounts);

  // Rehydrate the persisted stores on the client (they skip auto-hydration).
  useEffect(() => {
    useCart.persist.rehydrate();
    useOrders.persist.rehydrate();
    useAuth.persist.rehydrate();
    useAddresses.persist.rehydrate();
    useCoupons.persist.rehydrate();
    useWallet.persist.rehydrate();
    useCustomers.persist.rehydrate();
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
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponOptions, setCouponOptions] = useState<CouponOption[] | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Seed the address book once from the service if it's still empty.
  useEffect(() => {
    if (addrHydrated && !addrSeeded) getAddressBook().then(seedAddrs);
  }, [addrHydrated, addrSeeded, seedAddrs]);

  // Same for the coupon wallet and the money wallet — both may be reached for
  // the first time here rather than from the account app.
  useEffect(() => {
    if (couponsHydrated && !couponsSeeded) getGrantedClaims().then(seedCoupons);
  }, [couponsHydrated, couponsSeeded, seedCoupons]);
  useEffect(() => {
    if (walletHydrated && !walletSeeded) getWallet().then(seedWallet);
  }, [walletHydrated, walletSeeded, seedWallet]);

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
      vendor ? computeTotals({ vendor, lines, tipPercent, coupon, fulfillment }) : null,
    [vendor, lines, tipPercent, coupon, fulfillment],
  );

  /** The basket the coupon seam prices against — cart, not hand-assembled totals. */
  const basket: BasketInput | null = useMemo(
    () =>
      vendor
        ? { vendor, lines, fulfillment, isFirstOrder: pastOrders.length === 0 }
        : null,
    [vendor, lines, fulfillment, pastOrders.length],
  );

  /**
   * Re-price the wallet whenever the basket changes. Switching to pickup or
   * dropping an item can invalidate the applied coupon, so the applied one is
   * re-read from the same fresh evaluation rather than kept on trust — and
   * removed, with the reason, if it no longer applies.
   */
  const appliedId = coupon?.coupon.id ?? null;
  useEffect(() => {
    if (!basket || !couponsHydrated || !couponsSeeded) return;
    let live = true;
    getBasketCoupons(claims, basket).then((picker) => {
      if (!live) return;
      setCouponOptions(picker.options);
      if (!appliedId) return;
      const current = picker.options.find((o) => o.held.coupon.id === appliedId);
      if (!current) {
        setCoupon(null);
      } else if (!current.evaluation.eligible) {
        setCoupon(null);
        toast.info(tc(`reason.${current.evaluation.reasonKey}`));
      } else {
        setCoupon({ coupon: current.held.coupon, evaluation: current.evaluation });
      }
    });
    return () => {
      live = false;
    };
  }, [claims, basket, couponsHydrated, couponsSeeded, appliedId, tc]);

  /**
   * The wallet can stop being affordable after it was chosen — adding a tip or
   * losing a coupon both raise the total. The tender is therefore *derived*
   * rather than trusted: it falls back to cash the moment the balance stops
   * covering the order, and the wallet button says by how much it falls short.
   * Deriving it means there is no window in which the selection is stale.
   */
  const walletTotal = pricing?.total ?? 0;
  const tender: PaymentMethod =
    payment === "wallet" && !coversAmount(walletBalance, walletTotal) ? "cash" : payment;

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

  /** Apply a coupon the customer already holds, picked from the sheet. */
  function handleApplyCoupon(couponId: string) {
    if (!basket) return;
    setCouponBusy(true);
    applyCoupon(couponId, claims, basket).then((res) => {
      setCouponBusy(false);
      if (res.error || !res.data) {
        toast.error(tc(res.error ?? "errors.unknownCode"));
        return;
      }
      setCoupon({ coupon: res.data.coupon, evaluation: res.data.evaluation });
      toast.success(tc("applied", { code: res.data.coupon.code }));
    });
  }

  /**
   * Apply a typed code. The seam claims it first when the customer doesn't hold
   * it yet, so a code from a flyer works here without a detour through the
   * wallet — and the new claim is persisted so it is there next time.
   */
  function handleApplyCode(code: string) {
    if (!basket) return;
    setCouponBusy(true);
    applyCouponCode(code, claims, basket).then((res) => {
      setCouponBusy(false);
      if (res.error || !res.data) {
        toast.error(tc(res.error));
        return;
      }
      if (res.data.claimed) addClaim(res.data.claim, res.data.coupon);
      setCoupon({ coupon: res.data.coupon, evaluation: res.data.evaluation });
      toast.success(tc("applied", { code: res.data.coupon.code }));
    });
  }

  /**
   * Record the spend once the order exists. Cashback is credited to the wallet
   * here rather than taken off the total — that is what makes it cashback.
   */
  function settleCoupon(order: (typeof pastOrders)[number]) {
    if (!coupon) return;
    redeemCoupon(coupon.coupon.id, claims, order, coupon.evaluation).then((res) => {
      if (res.error || !res.data) return;
      recordRedemption(coupon.coupon.id, res.data);
      if (res.data.cashback > 0) {
        rewardWallet(
          res.data.cashback,
          `${coupon.coupon.title} · ${coupon.coupon.code}`,
          order.orderNumber,
        );
      }
    });
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

    // Checked at submit rather than on the contact field: the number can be
    // edited up to the last keystroke, and refusing mid-typing would tell somebody
    // they are blocked before they have finished saying who they are.
    if (isPhoneBlocked(managedAccounts, contactPhone.trim())) {
      toast.error(t("errors.accountBlocked"));
      return;
    }

    setSubmitting(true);

    // Online payments authorise before the order exists (spec: "Online Payment
    // (Mock)"). Cash skips straight through — there is nothing to authorise
    // until the rider is on the doorstep, which is where the machine settles it.
    // The wallet authorises against its own balance rather than the card
    // gateway: it is the one tender that can genuinely refuse (C19).
    const authorise: Promise<{ data: { authCode: string } | null; error: string | null }> =
      tender === "cash"
        ? Promise.resolve({ data: { authCode: "" }, error: null })
        : tender === "wallet"
          ? authoriseWalletPayment({ balance: walletBalance, amount: pricing.total })
          : authorisePayment({ method: tender, cardNumber: DEMO_CARD_NUMBER });

    authorise.then((auth) => {
      if (auth.error) {
        setSubmitting(false);
        toast.error(t(auth.error));
        return;
      }
      placeOrder({
        vendor,
        lines,
        fulfillment,
        address,
        scheduledFor: timeMode === "schedule" ? scheduledSlot : null,
        contact: { name: contactName.trim(), phone: contactPhone.trim() },
        notes: notes.trim() || null,
        payment: { method: tender, cardLast4: tender === "card" ? DEMO_CARD_LAST4 : null },
        pricing,
      }).then((res) => {
        if (res.error || !res.data) {
          setSubmitting(false);
          toast.error(t(res.error ?? "errors.generic"));
          return;
        }
        const order = res.data;
        // The debit is posted against the order, not the click: the ledger row
        // carries the order number, so the wallet page and the receipt refer to
        // the same payment and a refund can find it again (C19).
        if (order.payment.method === "wallet") {
          payFromWallet(order.pricing.total, order.vendor.name, order.orderNumber);
        }
        addOrder(order);
        settleCoupon(order);
        clearCart();
        router.push(`/checkout/success?order=${order.id}`);
      });
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
            <PaymentMethods
              value={tender}
              onChange={setPayment}
              currency={currency}
              walletBalance={walletBalance}
              total={pricing.total}
            />
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
          couponSlot={
            <CouponField
              currency={currency}
              options={couponOptions}
              applied={coupon}
              busy={couponBusy}
              onApplyCode={handleApplyCode}
              onApplyCoupon={handleApplyCoupon}
              onRemove={() => setCoupon(null)}
            />
          }
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
