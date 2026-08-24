"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Cuisine, VendorSettings } from "@/types";
import { getCuisines } from "@/services/catalog";
import { useVendorSettings } from "@/stores/vendor-settings";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * ProfilePanel — the restaurant's public face and how to reach it (G18).
 *
 * Saves through `stores/vendor-settings`, which validates in
 * `lib/vendor-settings.saveProfile` — so nothing here decides whether a value is
 * acceptable. The panel's own job is to hold the form and show what the domain
 * refused.
 *
 * The profile and the contact details are **two saves**, deliberately. They are two
 * different records underneath — the profile is a patch over the catalog listing,
 * the phone and email are fields the catalog does not have at all — and a single
 * button that half-succeeded would leave the fold showing a state neither the
 * restaurant nor the store had agreed to.
 *
 * `logo` and `cover` are URL fields rather than a file picker. There is no file
 * storage in the prototype, and a picker that appears to accept a photograph and
 * keeps nothing is the decoration Phases 6–7 refused for documents.
 */
export function ProfilePanel({ settings }: { settings: VendorSettings }) {
  const t = useTranslations("vendorSettings");
  const vendor = settings.vendor;

  const saveProfile = useVendorSettings((s) => s.saveProfile);
  const saveContact = useVendorSettings((s) => s.saveContact);

  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  /**
   * The form is seeded from the fold and then owned by the panel.
   *
   * Keyed on the vendor id so switching restaurants re-seeds, but *not* on the
   * settings object: re-seeding on every store change would wipe whatever the
   * person was typing the moment an unrelated save landed.
   */
  const [form, setForm] = useState(() => initial(settings));
  const [contact, setContact] = useState(() => ({ ...settings.contact }));
  const [seededFor, setSeededFor] = useState(vendor.id);
  if (seededFor !== vendor.id) {
    setSeededFor(vendor.id);
    setForm(initial(settings));
    setContact({ ...settings.contact });
  }

  useEffect(() => {
    let active = true;
    getCuisines().then((list) => {
      if (active) setCuisines(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const err = (field: string) =>
    profileErrors[field] ? t(profileErrors[field]) : undefined;
  const cErr = (field: string) =>
    contactErrors[field] ? t(contactErrors[field]) : undefined;

  function submitProfile() {
    setSavingProfile(true);
    const { errors } = saveProfile(vendor.id, {
      name: form.name,
      tagline: form.tagline,
      description: form.description,
      logo: form.logo,
      cover: form.cover,
      cuisineIds: form.cuisineIds,
      priceLevel: form.priceLevel,
      promoLabel: form.promoLabel || null,
      address: form.address,
      city: form.city,
    });
    setSavingProfile(false);
    setProfileErrors(errors);
    if (Object.keys(errors).length) {
      toast.error(t("saveFailed"));
      return;
    }
    toast.success(t("saved"));
  }

  function submitContact() {
    setSavingContact(true);
    const { errors } = saveContact(vendor.id, contact);
    setSavingContact(false);
    setContactErrors(errors);
    if (Object.keys(errors).length) {
      toast.error(t("saveFailed"));
      return;
    }
    toast.success(t("saved"));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="text-sm font-bold text-ink">{t("profile.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("profile.subtitle")}</p>

        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="set-name" label={t("field.name")} error={err("name")}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("name"))}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              )}
            </Field>
            <Field
              id="set-tagline"
              label={t("field.tagline")}
              hint={t("hint.tagline")}
              error={err("tagline")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("tagline"))}
                  value={form.tagline}
                  onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                />
              )}
            </Field>
          </div>

          <Field
            id="set-desc"
            label={t("field.description")}
            hint={t("hint.description")}
            error={err("description")}
          >
            {({ id, describedBy }) => (
              <textarea
                id={id}
                aria-describedby={describedBy}
                aria-invalid={Boolean(err("description"))}
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
              />
            )}
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">
              {t("field.cuisines")}
            </legend>
            {cuisines.length === 0 ? (
              <p className="text-xs text-muted">{t("loading")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {cuisines.map((cuisine) => {
                  const on = form.cuisineIds.includes(cuisine.id);
                  return (
                    <button
                      key={cuisine.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setForm({
                          ...form,
                          cuisineIds: on
                            ? form.cuisineIds.filter((c) => c !== cuisine.id)
                            : [...form.cuisineIds, cuisine.id],
                        })
                      }
                      className={cn(
                        "rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-line text-body hover:bg-surface-muted",
                      )}
                    >
                      <span aria-hidden>{cuisine.emoji}</span> {cuisine.name}
                    </button>
                  );
                })}
              </div>
            )}
            {err("cuisineIds") && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {err("cuisineIds")}
              </p>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="set-price" label={t("field.priceLevel")}>
              {({ id }) => (
                <select
                  id={id}
                  value={form.priceLevel}
                  onChange={(e) =>
                    setForm({ ...form, priceLevel: Number(e.target.value) as 1 | 2 | 3 | 4 })
                  }
                  className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary"
                >
                  {([1, 2, 3, 4] as const).map((level) => (
                    <option key={level} value={level}>
                      {"$".repeat(level)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              id="set-promo"
              label={t("field.promoLabel")}
              hint={t("hint.promoLabel")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={form.promoLabel}
                  onChange={(e) => setForm({ ...form, promoLabel: e.target.value })}
                />
              )}
            </Field>
          </div>

          {/* URLs, not uploads — there is no file storage, and the hint says so. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="set-logo" label={t("field.logo")} hint={t("hint.image")}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="url"
                  inputMode="url"
                  aria-describedby={describedBy}
                  value={form.logo}
                  onChange={(e) => setForm({ ...form, logo: e.target.value })}
                />
              )}
            </Field>
            <Field id="set-cover" label={t("field.cover")} hint={t("hint.image")}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="url"
                  inputMode="url"
                  aria-describedby={describedBy}
                  value={form.cover}
                  onChange={(e) => setForm({ ...form, cover: e.target.value })}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="set-address" label={t("field.address")} error={err("address")}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("address"))}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              )}
            </Field>
            <Field id="set-city" label={t("field.city")} error={err("city")}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("city"))}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              )}
            </Field>
          </div>

          {/* Coordinates are not editable: the prototype has no geocoder, and a
              hand-typed latitude would silently move the restaurant on the map the
              rider is navigating by. */}
          <p className="text-xs text-muted">
            {t("hint.coordinates", {
              lat: vendor.location.lat.toFixed(4),
              lng: vendor.location.lng.toFixed(4),
            })}
          </p>

          <div className="flex justify-end">
            <Button onClick={submitProfile} disabled={savingProfile}>
              {savingProfile && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("save")}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="text-sm font-bold text-ink">{t("contact.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("contact.subtitle")}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="set-phone" label={t("field.phone")} error={cErr("phone")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="tel"
                inputMode="tel"
                aria-describedby={describedBy}
                aria-invalid={Boolean(cErr("phone"))}
                value={contact.phone}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              />
            )}
          </Field>
          <Field id="set-email" label={t("field.email")} error={cErr("email")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="email"
                inputMode="email"
                aria-describedby={describedBy}
                aria-invalid={Boolean(cErr("email"))}
                value={contact.email}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
              />
            )}
          </Field>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={submitContact} disabled={savingContact}>
            {savingContact && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("save")}
          </Button>
        </div>
      </section>
    </div>
  );
}

/** The form's starting values, read off the fold. */
function initial(settings: VendorSettings) {
  const v = settings.vendor;
  return {
    name: v.name,
    tagline: v.tagline,
    description: v.description,
    logo: v.logo,
    cover: v.cover,
    cuisineIds: [...v.cuisineIds],
    priceLevel: v.priceLevel,
    promoLabel: v.promoLabel ?? "",
    address: v.location.address,
    city: v.location.city,
  };
}
