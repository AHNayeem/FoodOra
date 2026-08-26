"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ChevronDown,
  Loader2,
  MapPin,
  Plus,
  Power,
  PowerOff,
  X,
} from "lucide-react";
import type { DeliveryZone, PlatformSettings } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { usePlatformSettings } from "@/stores/platform-settings";
import {
  MAX_PEAK_MULTIPLIER,
  MAX_RADIUS_KM,
  MIN_PEAK_MULTIPLIER,
  MIN_RADIUS_KM,
  type ZoneInput,
} from "@/lib/platform-settings";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Every hour of the day, for the peak-hour picker. */
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * ZonesPanel — the delivery network: what each zone covers, what it pays, and
 * whether couriers work it at all (Phase 19, G30).
 *
 * `lib/mock/delivery-zones.ts` has said since Phase C18 that fares are *data* and
 * that the values "map onto the future `DeliveryZone` model, where an admin edits
 * these values". This is that admin.
 *
 * The panel is deliberately two things at once, because in this domain they are
 * one record:
 *
 *  - **Coverage** — the area labels and the cross-zone radius. These are the
 *    answer the customer's location picker and the restaurant page's
 *    serviceability notice give: an area removed here disappears from the picker,
 *    and a radius narrowed here starts refusing restaurants that are too far out.
 *    Editing them is editing what the storefront will accept.
 *  - **Fares** — base, per-km, peak, batch and the cash ceiling. These are what a
 *    courier is paid and what they may hold before a remittance. Editing them
 *    changes the rider app's wallet, dispatch's cash guard and the payout stamped
 *    on the next completed order.
 *
 * A zone's **centre, city and currency are shown read-only**, for the reason
 * `types/platform-settings` states: they are its identity, and moving `lat`/`lng`
 * would silently re-place every synthesised pickup in the seeded week.
 *
 * Closing the last open zone is refused in the domain rather than hidden here —
 * see `lib/platform-settings.setZoneActive`. A network that serves nowhere would
 * leave the location picker with an empty list and answer every address
 * "outside the network", which is not a configuration anybody meant.
 */
export function ZonesPanel({
  settings,
  editable,
}: {
  settings: PlatformSettings;
  editable: boolean;
}) {
  const t = useTranslations("platformSettings");
  const [open, setOpen] = useState<string | null>(settings.zones[0]?.id ?? null);

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="text-sm font-bold text-ink">{t("zones.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("zones.subtitle")}</p>
        <p className="mt-3 text-xs text-muted">{t("zones.note")}</p>
      </section>

      <ul className="space-y-3">
        {settings.zones.map((zone) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            editable={editable}
            expanded={open === zone.id}
            onToggle={() => setOpen((prev) => (prev === zone.id ? null : zone.id))}
          />
        ))}
      </ul>
    </div>
  );
}

/** A number input's value, tolerating an empty field mid-typing. */
function num(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** The form's own state — the zone's editable fields and nothing else. */
function formOf(zone: DeliveryZone): ZoneInput {
  return {
    name: zone.name,
    areas: [...zone.areas],
    deliveryRadiusKm: zone.deliveryRadiusKm,
    baseFare: zone.baseFare,
    perKm: zone.perKm,
    peakMultiplier: zone.peakMultiplier,
    peakHours: [...zone.peakHours],
    batchBonus: zone.batchBonus,
    cashLimit: zone.cashLimit,
  };
}

function ZoneCard({
  zone,
  editable,
  expanded,
  onToggle,
}: {
  zone: DeliveryZone;
  editable: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("platformSettings");
  const currency = zone.currency as CurrencyCode;
  const open = !zone.deletedAt;

  const saveZone = usePlatformSettings((s) => s.saveZone);
  const setActive = usePlatformSettings((s) => s.setZoneActive);

  const [form, setForm] = useState<ZoneInput>(() => formOf(zone));
  const [area, setArea] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Re-seed when the record underneath changes — see `RegionsPanel.RegionRow`.
  const [seed, setSeed] = useState(zone.updatedAt);
  if (seed !== zone.updatedAt) {
    setSeed(zone.updatedAt);
    setForm(formOf(zone));
  }

  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);
  const id = `zone-${zone.id}`;
  const patch = (next: Partial<ZoneInput>) => setForm((f) => ({ ...f, ...next }));

  function submit() {
    setSaving(true);
    const { errors: next } = saveZone(zone.id, form);
    setSaving(false);
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error(t("saveFailed"));
      return;
    }
    toast.success(t("saved"));
  }

  function toggleOpen() {
    const { errors: next } = setActive(zone.id, !open);
    if (next.active) {
      toast.error(t(next.active));
      return;
    }
    toast.success(open ? t("zones.closedToast") : t("zones.openedToast"));
  }

  function addArea() {
    const value = area.trim();
    if (!value) return;
    if (form.areas.some((a) => a.toLowerCase() === value.toLowerCase())) {
      setArea("");
      return;
    }
    patch({ areas: [...form.areas, value] });
    setArea("");
  }

  return (
    <li
      className={cn(
        "rounded-card border bg-surface shadow-card",
        open ? "border-line" : "border-dashed border-line",
      )}
    >
      <div className={cn("p-5", !open && "opacity-75")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
              <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
              {zone.name}
              {!open && <Badge tone="danger">{t("zones.closed")}</Badge>}
            </h3>
            <p className="mt-1 text-xs text-muted">
              {t("zones.fixed", {
                city: zone.city,
                currency: zone.currency,
                lat: zone.lat.toFixed(3),
                lng: zone.lng.toFixed(3),
              })}
            </p>
            <p className="mt-1 text-xs text-muted">
              {t("zones.summary", {
                areas: zone.areas.length,
                radius: zone.deliveryRadiusKm,
                base: formatPrice(zone.baseFare, currency),
                perKm: formatPrice(zone.perKm, currency),
                cash: formatPrice(zone.cashLimit, currency),
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={open ? "outline" : "primary"}
              size="sm"
              disabled={!editable}
              onClick={toggleOpen}
            >
              {open ? (
                <PowerOff className="size-4" aria-hidden />
              ) : (
                <Power className="size-4" aria-hidden />
              )}
              {open ? t("zones.closeZone") : t("zones.openZone")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-controls={`${id}-body`}
              onClick={onToggle}
            >
              <ChevronDown
                className={cn("size-4 transition-transform", expanded && "rotate-180")}
                aria-hidden
              />
              {expanded ? t("zones.collapse") : t("zones.edit")}
            </Button>
          </div>
        </div>
      </div>

      {expanded && (
        <div id={`${id}-body`} className="space-y-5 border-t border-line p-5">
          <Field id={`${id}-name`} label={t("zones.name")} error={err("name")}>
            {({ id: fieldId, describedBy }) => (
              <Input
                id={fieldId}
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.name)}
                value={form.name}
                disabled={!editable || saving}
                onChange={(e) => patch({ name: e.target.value })}
              />
            )}
          </Field>

          {/* Coverage — what the storefront will accept. */}
          <fieldset>
            <legend className="text-sm font-semibold text-ink">
              {t("zones.areas")}
            </legend>
            <p className="mt-1 text-xs text-muted">{t("zones.areasHint")}</p>

            <ul className="mt-2.5 flex flex-wrap gap-2">
              {form.areas.map((name) => (
                <li key={name}>
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-muted py-1 ps-3 pe-1.5 text-xs font-semibold text-body">
                    {name}
                    <button
                      type="button"
                      disabled={!editable || saving}
                      aria-label={t("zones.removeArea", { area: name })}
                      onClick={() =>
                        patch({ areas: form.areas.filter((a) => a !== name) })
                      }
                      className="inline-flex size-5 items-center justify-center rounded-pill text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field
                id={`${id}-add-area`}
                label={t("zones.addAreaLabel")}
                className="min-w-48 flex-1"
              >
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    value={area}
                    disabled={!editable || saving}
                    placeholder={t("zones.addAreaPlaceholder")}
                    onChange={(e) => setArea(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      // The field sits inside no form, but Enter is what somebody
                      // adding six areas in a row will press.
                      e.preventDefault();
                      addArea();
                    }}
                  />
                )}
              </Field>
              <Button
                variant="outline"
                disabled={!editable || saving || !area.trim()}
                onClick={addArea}
              >
                <Plus className="size-4" aria-hidden />
                {t("zones.addArea")}
              </Button>
            </div>
            {errors.areas && (
              <p role="alert" className="mt-2 text-xs font-medium text-danger">
                {t(errors.areas)}
              </p>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              id={`${id}-radius`}
              label={t("zones.radius")}
              hint={t("zones.radiusHint", { min: MIN_RADIUS_KM, max: MAX_RADIUS_KM })}
              error={err("deliveryRadiusKm")}
              value={form.deliveryRadiusKm}
              min={MIN_RADIUS_KM}
              max={MAX_RADIUS_KM}
              step="0.5"
              disabled={!editable || saving}
              onChange={(v) => patch({ deliveryRadiusKm: v })}
            />
            <NumberField
              id={`${id}-cash`}
              label={t("zones.cashLimit")}
              hint={t("zones.cashLimitHint")}
              error={err("cashLimit")}
              value={form.cashLimit}
              min={0}
              step="50"
              disabled={!editable || saving}
              onChange={(v) => patch({ cashLimit: v })}
            />
          </div>

          {/* Fares — what a courier is paid. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField
              id={`${id}-base`}
              label={t("zones.baseFare")}
              error={err("baseFare")}
              value={form.baseFare}
              min={0}
              step="1"
              disabled={!editable || saving}
              onChange={(v) => patch({ baseFare: v })}
            />
            <NumberField
              id={`${id}-perkm`}
              label={t("zones.perKm")}
              error={err("perKm")}
              value={form.perKm}
              min={0}
              step="0.5"
              disabled={!editable || saving}
              onChange={(v) => patch({ perKm: v })}
            />
            <NumberField
              id={`${id}-peak`}
              label={t("zones.peakMultiplier")}
              hint={t("zones.peakMultiplierHint", {
                min: MIN_PEAK_MULTIPLIER,
                max: MAX_PEAK_MULTIPLIER,
              })}
              error={err("peakMultiplier")}
              value={form.peakMultiplier}
              min={MIN_PEAK_MULTIPLIER}
              max={MAX_PEAK_MULTIPLIER}
              step="0.05"
              disabled={!editable || saving}
              onChange={(v) => patch({ peakMultiplier: v })}
            />
            <NumberField
              id={`${id}-batch`}
              label={t("zones.batchBonus")}
              error={err("batchBonus")}
              value={form.batchBonus}
              min={0}
              step="1"
              disabled={!editable || saving}
              onChange={(v) => patch({ batchBonus: v })}
            />
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-ink">
              {t("zones.peakHours")}
            </legend>
            <p className="mt-1 text-xs text-muted">{t("zones.peakHoursHint")}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {HOURS.map((hour) => {
                const on = form.peakHours.includes(hour);
                return (
                  <button
                    key={hour}
                    type="button"
                    aria-pressed={on}
                    disabled={!editable || saving}
                    onClick={() =>
                      patch({
                        peakHours: on
                          ? form.peakHours.filter((h) => h !== hour)
                          : [...form.peakHours, hour].sort((a, b) => a - b),
                      })
                    }
                    className={cn(
                      "h-9 w-10 rounded-field border text-xs font-semibold tabular-nums transition-colors disabled:opacity-50",
                      on
                        ? "border-primary bg-primary text-white"
                        : "border-line bg-surface text-muted hover:text-ink",
                    )}
                  >
                    {String(hour).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
            {errors.peakHours && (
              <p role="alert" className="mt-2 text-xs font-medium text-danger">
                {t(errors.peakHours)}
              </p>
            )}
          </fieldset>

          <div className="flex justify-end">
            <Button disabled={!editable || saving} onClick={submit}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("save")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * A numeric field.
 *
 * Its own component because there are eight of them on this panel and the
 * `NaN`-while-empty handling has to be identical in all eight: the form holds the
 * raw number and the domain refuses `NaN` as `errors.required`, so a half-typed
 * field is a validation failure rather than a silent zero.
 */
function NumberField({
  id,
  label,
  hint,
  error,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  value: number;
  min?: number;
  max?: number;
  step?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {({ id: fieldId, describedBy }) => (
        <Input
          id={fieldId}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          value={Number.isFinite(value) ? value : ""}
          disabled={disabled}
          onChange={(e) => onChange(num(e.target.value))}
        />
      )}
    </Field>
  );
}
