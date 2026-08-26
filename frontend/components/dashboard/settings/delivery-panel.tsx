"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bike, Loader2, ShoppingBag } from "lucide-react";
import type { VendorDeliverySettings, VendorSettings } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useVendorSettings } from "@/stores/vendor-settings";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A number input's value, tolerating an empty field mid-typing. */
function num(raw: string, fallback = 0): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * DeliveryPanel — how this restaurant fulfils orders (G18).
 *
 * The boundary this panel draws is the one worth stating, because it is easy to
 * cross by accident: a restaurant sets **its own** terms — whether it delivers at
 * all, its fee, its minimum, its free-delivery threshold and its ETA window — and
 * it does not set the platform's geography. Delivery zones are what dispatch prices
 * and routes against, and since Phase 19 (G30) they have a surface of their own —
 * `/admin/settings`, gated on `settings.manage`. So the zones the restaurant was
 * approved for are *shown* here and are not editable, and the panel says who to
 * ask. That "who" is now a screen rather than a source file, which is the only
 * thing G30 changed about this panel.
 *
 * Every field flows into `computeTotals` on the customer's next order, which is why
 * the validation is in `lib/vendor-settings.deliveryErrors` and not here: a negative
 * fee would price an order wrong, and a reversed ETA window is a promise the
 * tracker cannot draw.
 */
export function DeliveryPanel({ settings }: { settings: VendorSettings }) {
  const t = useTranslations("vendorSettings");
  const vendor = settings.vendor;
  const currency = vendor.currency as CurrencyCode;

  const save = useVendorSettings((s) => s.saveDelivery);

  const [form, setForm] = useState<VendorDeliverySettings>(() => ({
    ...settings.delivery,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [seededFor, setSeededFor] = useState(vendor.id);
  if (seededFor !== vendor.id) {
    setSeededFor(vendor.id);
    setForm({ ...settings.delivery });
  }

  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);

  function submit() {
    setSaving(true);
    const { errors: next } = save(vendor.id, form);
    setSaving(false);
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error(t("saveFailed"));
      return;
    }
    toast.success(t("saved"));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="text-sm font-bold text-ink">{t("delivery.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("delivery.subtitle")}</p>

        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-ink">
            {t("delivery.modes")}
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <ModeToggle
              icon={Bike}
              label={t("delivery.offersDelivery")}
              hint={t("delivery.offersDeliveryHint")}
              on={form.offersDelivery}
              onToggle={() =>
                setForm({ ...form, offersDelivery: !form.offersDelivery })
              }
            />
            <ModeToggle
              icon={ShoppingBag}
              label={t("delivery.offersPickup")}
              hint={t("delivery.offersPickupHint")}
              on={form.offersPickup}
              onToggle={() => setForm({ ...form, offersPickup: !form.offersPickup })}
            />
          </div>
          {err("mode") && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
              {err("mode")}
            </p>
          )}
        </fieldset>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            id="del-fee"
            label={t("field.deliveryFee", { currency })}
            error={err("deliveryFee")}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="number"
                min={0}
                inputMode="decimal"
                aria-describedby={describedBy}
                aria-invalid={Boolean(err("deliveryFee"))}
                value={form.deliveryFee}
                onChange={(e) =>
                  setForm({ ...form, deliveryFee: num(e.target.value) })
                }
              />
            )}
          </Field>
          <Field
            id="del-min"
            label={t("field.minOrder", { currency })}
            error={err("minOrder")}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="number"
                min={0}
                inputMode="decimal"
                aria-describedby={describedBy}
                aria-invalid={Boolean(err("minOrder"))}
                value={form.minOrder}
                onChange={(e) => setForm({ ...form, minOrder: num(e.target.value) })}
              />
            )}
          </Field>
        </div>

        <div className="mt-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-field border border-line bg-surface-alt p-3.5">
            <input
              type="checkbox"
              checked={form.freeDeliveryOver != null}
              onChange={(e) =>
                setForm({
                  ...form,
                  // Null and zero are different offers: null is "never free",
                  // zero would make every order free delivery.
                  freeDeliveryOver: e.target.checked
                    ? Math.max(form.minOrder, 500)
                    : null,
                })
              }
              className="mt-0.5 size-4.5 shrink-0 accent-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">
                {t("delivery.freeOver")}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {t("delivery.freeOverHint")}
              </span>
              {form.freeDeliveryOver != null && (
                <span className="mt-2 block max-w-40">
                  <Input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    aria-label={t("delivery.freeOver")}
                    aria-invalid={Boolean(err("freeDeliveryOver"))}
                    value={form.freeDeliveryOver}
                    onChange={(e) =>
                      setForm({ ...form, freeDeliveryOver: num(e.target.value) })
                    }
                  />
                </span>
              )}
            </span>
          </label>
          {err("freeDeliveryOver") && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
              {err("freeDeliveryOver")}
            </p>
          )}
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-ink">{t("field.eta")}</legend>
          <p className="mt-0.5 text-xs text-muted">{t("hint.eta")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              aria-label={t("field.etaLow")}
              aria-invalid={Boolean(err("etaMinutes"))}
              value={form.etaMinutes[0]}
              onChange={(e) =>
                setForm({
                  ...form,
                  etaMinutes: [num(e.target.value), form.etaMinutes[1]],
                })
              }
              className="w-28"
            />
            <span className="text-muted" aria-hidden>
              –
            </span>
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              aria-label={t("field.etaHigh")}
              aria-invalid={Boolean(err("etaMinutes"))}
              value={form.etaMinutes[1]}
              onChange={(e) =>
                setForm({
                  ...form,
                  etaMinutes: [form.etaMinutes[0], num(e.target.value)],
                })
              }
              className="w-28"
            />
            <span className="text-sm text-muted">{t("minutes")}</span>
          </div>
          {err("etaMinutes") && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
              {err("etaMinutes")}
            </p>
          )}
        </fieldset>

        {/* What the customer will actually see, from the values above. Shown
            because a fee and a threshold in two boxes do not read as an offer. */}
        <p className="mt-5 rounded-field bg-surface-muted p-3 text-sm text-body">
          {form.freeDeliveryOver != null
            ? t("delivery.preview", {
                fee: formatPrice(form.deliveryFee, currency),
                min: formatPrice(form.minOrder, currency),
                free: formatPrice(form.freeDeliveryOver, currency),
              })
            : t("delivery.previewNoFree", {
                fee: formatPrice(form.deliveryFee, currency),
                min: formatPrice(form.minOrder, currency),
              })}
        </p>

        <div className="mt-4 flex justify-end">
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("save")}
          </Button>
        </div>
      </section>

      {/* The platform's geography, read-only. See the component header: zones are
          what dispatch prices against and they are not a restaurant's setting. */}
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="text-sm font-bold text-ink">{t("zones.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("zones.subtitle")}</p>
        <p className="mt-3 rounded-field bg-surface-muted p-3 text-sm text-muted">
          {t("zones.readOnly")}
        </p>
      </section>
    </div>
  );
}

/** A big, tappable on/off card — a kitchen sets these once, on a phone. */
function ModeToggle({
  icon: Icon,
  label,
  hint,
  on,
  onToggle,
}: {
  icon: typeof Bike;
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "flex items-start gap-3 rounded-field border p-3.5 text-start transition-colors",
        on
          ? "border-primary bg-primary/5"
          : "border-line bg-surface hover:bg-surface-muted",
      )}
    >
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-pill",
          on ? "bg-primary/10 text-primary" : "bg-surface-muted text-muted",
        )}
      >
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
    </button>
  );
}
