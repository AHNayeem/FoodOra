"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Globe, Loader2, Power, PowerOff } from "lucide-react";
import type { PlatformRegion, PlatformSettings } from "@/types";
import { usePlatformSettings } from "@/stores/platform-settings";
import { MAX_TAX_RATE } from "@/lib/platform-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * RegionsPanel — the countries the platform trades in, and on what tax terms
 * (Phase 19, G30).
 *
 * `config/regions.ts` has been the platform's country table since the first
 * commit and its own header said what it was waiting for: "in production it
 * becomes an admin-editable table". This is that table.
 *
 * What is editable here and what is not is the panel's whole argument, and it is
 * stated on `types/platform-settings` rather than repeated per field: the **tax
 * rate** and the **tax label** are policy and are editable; the currency's symbol,
 * locale and precision are facts about ISO 4217 and `Intl` and are shown
 * read-only. An operator who could set BDT to two decimals would not be
 * configuring the platform, they would be breaking `lib/format`.
 *
 * The rate is entered as a **percentage** and stored as a fraction. That is not a
 * cosmetic choice: `0.19` typed into a field labelled "rate" as `19` is the
 * mistake that would multiply the tax on every order by twenty, and a field that
 * says `%` beside it is the version of this control where that cannot be typed.
 * `lib/platform-settings.regionErrors` refuses anything over
 * `MAX_TAX_RATE` as the second line of that defence.
 */
export function RegionsPanel({
  settings,
  editable,
}: {
  settings: PlatformSettings;
  editable: boolean;
}) {
  const t = useTranslations("platformSettings");

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="text-sm font-bold text-ink">{t("regions.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("regions.subtitle")}</p>
        <p className="mt-3 text-xs text-muted">{t("regions.note")}</p>
      </section>

      <ul className="space-y-3">
        {settings.regions.map((region) => (
          <RegionRow
            key={region.country.code}
            region={region}
            isDefault={settings.defaultCountry === region.country.code}
            editable={editable}
          />
        ))}
      </ul>
    </div>
  );
}

/** A percentage input's value as a fraction, tolerating an empty field mid-typing. */
function fractionOf(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed / 100 : Number.NaN;
}

/** A fraction as the percentage the field shows. `0.0875` → `8.75`, not `8.749999`. */
function percentOf(rate: number): string {
  return String(Math.round(rate * 10_000) / 100);
}

function RegionRow({
  region,
  isDefault,
  editable,
}: {
  region: PlatformRegion;
  isDefault: boolean;
  editable: boolean;
}) {
  const t = useTranslations("platformSettings");
  const { country, active, authored } = region;

  const saveRegion = usePlatformSettings((s) => s.saveRegion);
  const setActive = usePlatformSettings((s) => s.setRegionActive);
  const setDefault = usePlatformSettings((s) => s.setDefaultCountry);

  const [percent, setPercent] = useState(() => percentOf(country.taxRate));
  const [label, setLabel] = useState(country.taxLabel);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * Re-seed the form when the record underneath it changes.
   *
   * The same render-phase reconciliation `DeliveryPanel` uses rather than an
   * effect: another window can save this row (the store is synced across windows),
   * and a form that kept the old numbers would quietly write them back on the next
   * save.
   */
  const [seed, setSeed] = useState(`${country.taxRate}|${country.taxLabel}`);
  const current = `${country.taxRate}|${country.taxLabel}`;
  if (seed !== current) {
    setSeed(current);
    setPercent(percentOf(country.taxRate));
    setLabel(country.taxLabel);
  }

  const dirty =
    fractionOf(percent) !== country.taxRate || label.trim() !== country.taxLabel;
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);
  const id = `region-${country.code}`;

  function submit() {
    setSaving(true);
    const { errors: next } = saveRegion(country.code, {
      taxRate: fractionOf(percent),
      taxLabel: label,
    });
    setSaving(false);
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error(t("saveFailed"));
      return;
    }
    toast.success(t("saved"));
  }

  function toggle() {
    const { errors: next } = setActive(country.code, !active);
    if (next.active) {
      toast.error(t(next.active));
      return;
    }
    toast.success(active ? t("regions.closed") : t("regions.opened"));
  }

  return (
    <li
      className={cn(
        "rounded-card border bg-surface p-5 shadow-card",
        active ? "border-line" : "border-dashed border-line opacity-75",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
            <Globe className="size-4 shrink-0 text-primary" aria-hidden />
            {country.name}
            <span className="font-mono text-xs font-semibold text-muted">
              {country.code}
            </span>
            {isDefault && <Badge tone="primary">{t("regions.defaultBadge")}</Badge>}
            {!active && <Badge tone="danger">{t("regions.inactive")}</Badge>}
            {authored && <Badge tone="accent">{t("edited")}</Badge>}
          </h3>
          {/* Read-only, and said so: the currency's own shape is not policy. */}
          <p className="mt-1 text-xs text-muted">
            {t("regions.fixed", {
              currency: country.currency,
              timezone: country.timezone,
              dialCode: country.dialCode,
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isDefault && active && (
            <Button
              variant="ghost"
              size="sm"
              disabled={!editable}
              onClick={() => {
                const { errors: next } = setDefault(country.code);
                if (next.region) {
                  toast.error(t(next.region));
                  return;
                }
                toast.success(t("regions.defaultSet", { country: country.name }));
              }}
            >
              <Check className="size-4" aria-hidden />
              {t("regions.makeDefault")}
            </Button>
          )}
          <Button
            variant={active ? "outline" : "primary"}
            size="sm"
            disabled={!editable}
            onClick={toggle}
          >
            {active ? (
              <PowerOff className="size-4" aria-hidden />
            ) : (
              <Power className="size-4" aria-hidden />
            )}
            {active ? t("regions.close") : t("regions.open")}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          id={`${id}-label`}
          label={t("regions.taxLabel")}
          hint={t("regions.taxLabelHint")}
          error={err("taxLabel")}
        >
          {({ id: fieldId, describedBy }) => (
            <Input
              id={fieldId}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.taxLabel)}
              value={label}
              disabled={!editable || saving}
              onChange={(e) => setLabel(e.target.value)}
            />
          )}
        </Field>

        <Field
          id={`${id}-rate`}
          label={t("regions.taxRate")}
          hint={t("regions.taxRateHint", { max: Math.round(MAX_TAX_RATE * 100) })}
          error={err("taxRate")}
        >
          {({ id: fieldId, describedBy }) => (
            <div className="flex items-center gap-2">
              <Input
                id={fieldId}
                type="number"
                min={0}
                max={MAX_TAX_RATE * 100}
                step="0.01"
                inputMode="decimal"
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.taxRate)}
                value={percent}
                disabled={!editable || saving}
                onChange={(e) => setPercent(e.target.value)}
              />
              <span className="text-sm font-semibold text-muted" aria-hidden>
                %
              </span>
            </div>
          )}
        </Field>
      </div>

      <div className="mt-4 flex justify-end">
        <Button size="sm" disabled={!editable || saving || !dirty} onClick={submit}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t("save")}
        </Button>
      </div>
    </li>
  );
}
