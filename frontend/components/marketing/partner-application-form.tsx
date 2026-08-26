"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Plus, Send, Trash2 } from "lucide-react";
import type {
  Cuisine,
  DeliveryZone,
  User,
  VendorApplication,
  VendorBranch,
  VendorType,
  Weekday,
} from "@/types";
import { useAuth } from "@/stores/auth";
import { useOnboarding } from "@/stores/onboarding";
import {
  REQUIRED_VENDOR_DOCUMENTS,
  VENDOR_STEPS,
  emptyVendorDraft,
  vendorStepErrors,
  type VendorApplicationDraft,
  type VendorStep,
} from "@/lib/vendor-onboarding";
import { PAYOUT_METHODS, submittedDocument } from "@/lib/onboarding";
import { getCuisines } from "@/services/catalog";
import { usePlatformDraft } from "@/stores/platform-settings";
import { getDeliveryZones } from "@/services/delivery";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApplicationLog } from "@/components/onboarding/application-log";
import { DocumentList, UploadNotice } from "@/components/onboarding/document-list";
import { OnboardingStatusChip } from "@/components/onboarding/status-chip";
import { Stepper } from "@/components/onboarding/stepper";
import { cn } from "@/lib/utils";

const WEEK: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const VENDOR_TYPES: readonly VendorType[] = [
  "restaurant",
  "cafe",
  "cloud-kitchen",
  "home-chef",
  "catering",
];

/**
 * PartnerApplicationForm — the restaurant application (Phase 6, G08).
 *
 * `/partner` used to be a pitch page whose call to action was `/register`, so a
 * restaurant could "sign up" and land on a dashboard belonging to the flagship demo
 * vendor. This is the form that was missing: every group the spec lists — owner,
 * business, listing, hours, delivery, documents, payout, branches — collected into
 * one `VendorApplication` and sent to a queue a human works.
 *
 * Three decisions worth stating.
 *
 * **The steps are the domain's list.** `VENDOR_STEPS` drives the stepper, the
 * validation and the review summary, so a step cannot exist in the form and be
 * absent from the checks.
 *
 * **Validation is per step and re-run in full at the end.** A "next" button that
 * reports a problem on a page the applicant has not seen is not help; a submit that
 * skips the pages they navigated around is not validation. Both are handled by
 * `vendorStepErrors`, in `lib/`, so the reviewer's guards and the form's agree.
 *
 * **An existing application is shown, not silently replaced.** Somebody returning
 * to this page after applying sees where their application stands — and can pick a
 * draft back up or correct a refusal — because the alternative is a form that
 * quietly opens a second record for one restaurant.
 */
export function PartnerApplicationForm() {
  const user = useAuth((s) => s.user);
  const authHydrated = useAuth((s) => s.hydrated);
  const hydrated = useOnboarding((s) => s.hydrated);
  const applications = useOnboarding((s) => s.vendorApplications);

  useEffect(() => {
    useAuth.persist.rehydrate();
    useOnboarding.persist.rehydrate();
  }, []);

  const existing: VendorApplication | undefined = user
    ? applications.find((a) => a.ownerId === user.id && !a.deletedAt)
    : undefined;

  if (!authHydrated || !hydrated) {
    return <div className="h-96 animate-pulse rounded-card bg-surface" />;
  }

  // Already applied, and not editable from here: show where it stands.
  if (existing && existing.status !== "draft" && existing.status !== "rejected") {
    return <ApplicationStatusPanel application={existing} />;
  }

  // Mounted only once the session is known, which is what lets the wizard prefill
  // its very first render from the account instead of correcting itself in an
  // effect afterwards.
  return <PartnerWizard user={user} existing={existing} />;
}

/**
 * The wizard proper.
 *
 * `user` and `existing` are props rather than store reads so this mounts with
 * everything it needs: the draft is prefilled in its initial state, and a form
 * that asks somebody who is logged in to retype their own name is a form nobody
 * finishes.
 */
function PartnerWizard({
  user,
  existing,
}: {
  user: User | null;
  existing: VendorApplication | undefined;
}) {
  const t = useTranslations("onboarding");
  const applyAsVendor = useOnboarding((s) => s.applyAsVendor);
  const submitVendor = useOnboarding((s) => s.submitVendor);

  const [draft, setDraft] = useState<VendorApplicationDraft>(() => {
    const blank = emptyVendorDraft();
    return user
      ? {
          ...blank,
          owner: {
            ...blank.owner,
            name: user.name,
            email: user.email,
            phone: user.phone ?? "",
          },
        }
      : blank;
  });
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  // One reading of the clock for the whole form: a document's expiry must not
  // shift between renders while somebody is typing.
  const [now] = useState(() => Date.now());

  // An applicant is offered the zones the platform actually runs (Phase 19, G30) —
  // a restaurant approved into a closed zone is a listing nobody could deliver from.
  const platform = usePlatformDraft();

  useEffect(() => {
    getCuisines().then(setCuisines);
    getDeliveryZones(platform).then(setZones);
  }, [platform]);

  const current: VendorStep = VENDOR_STEPS[step];
  const errors = useMemo(() => vendorStepErrors(draft, current), [draft, current]);
  const allErrors = useMemo(() => vendorStepErrors(draft, "review"), [draft]);
  const err = (field: string) => (touched ? errors[field] : undefined);
  const errorText = (field: string) => {
    const key = err(field);
    return key ? t(key) : undefined;
  };

  function next() {
    setTouched(true);
    if (Object.keys(errors).length > 0) return;
    setTouched(false);
    setStep((s) => Math.min(s + 1, VENDOR_STEPS.length - 1));
  }

  function save(submit: boolean) {
    if (submit) {
      setTouched(true);
      if (Object.keys(allErrors).length > 0) {
        toast.error(t("errors.applicationIncomplete"));
        return;
      }
    }
    setSubmitting(true);
    const application = applyAsVendor({
      draft,
      ownerId: user?.id ?? null,
      submit,
      by: user?.name ?? draft.owner.name,
    });
    setSubmitting(false);
    toast.success(
      submit
        ? t("submitted", { reference: application.applicationNumber })
        : t("draftSavedToast"),
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h2 text-ink">{t("partnerTitle")}</h1>
        <p className="mt-1 text-body">{t("partnerSubtitle")}</p>
        {!user && (
          <p className="mt-3 rounded-card border border-line bg-surface p-3 text-sm text-muted">
            {t("signInHint")}
          </p>
        )}
      </header>

      {existing?.status === "rejected" && (
        <section className="rounded-card border border-danger/30 bg-danger/5 p-4">
          <h2 className="text-sm font-bold text-danger">{t("resubmitTitle")}</h2>
          <p className="mt-1 text-sm text-body">{existing.decisionNote}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            disabled={submitting}
            onClick={() => {
              const result = submitVendor(existing.id, user?.name ?? existing.owner.name);
              if (result.error) toast.error(t(result.error));
              else toast.success(t("resubmitted"));
            }}
          >
            <Send className="size-4" aria-hidden />
            {t("resubmit")}
          </Button>
        </section>
      )}

      <Stepper
        steps={VENDOR_STEPS}
        current={step}
        labelOf={(s) => t(`step.${s}`)}
        onGo={(index) => {
          setTouched(false);
          setStep(index);
        }}
      />

      <section className="space-y-4 rounded-card border border-line bg-surface p-5">
        <div>
          <h2 className="text-h3 text-ink">{t(`step.${current}`)}</h2>
          <p className="mt-1 text-sm text-muted">{t(`stepHint.${current}`)}</p>
        </div>

        {current === "owner" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="owner-name" label={t("field.ownerName")} error={errorText("owner.name")}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("owner.name"))}
                  value={draft.owner.name}
                  onChange={(e) =>
                    setDraft({ ...draft, owner: { ...draft.owner, name: e.target.value } })
                  }
                />
              )}
            </Field>
            <Field
              id="owner-email"
              label={t("field.ownerEmail")}
              error={errorText("owner.email")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="email"
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("owner.email"))}
                  value={draft.owner.email}
                  onChange={(e) =>
                    setDraft({ ...draft, owner: { ...draft.owner, email: e.target.value } })
                  }
                />
              )}
            </Field>
            <Field
              id="owner-phone"
              label={t("field.ownerPhone")}
              error={errorText("owner.phone")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="tel"
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("owner.phone"))}
                  value={draft.owner.phone}
                  onChange={(e) =>
                    setDraft({ ...draft, owner: { ...draft.owner, phone: e.target.value } })
                  }
                />
              )}
            </Field>
            <Field
              id="owner-nid"
              label={t("field.nationalId")}
              hint={t("hint.nationalId")}
              error={errorText("owner.nationalId")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("owner.nationalId"))}
                  value={draft.owner.nationalId}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      owner: { ...draft.owner, nationalId: e.target.value },
                    })
                  }
                />
              )}
            </Field>
          </div>
        )}

        {current === "business" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="legal-name"
              label={t("field.legalName")}
              hint={t("hint.legalName")}
              error={errorText("business.legalName")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("business.legalName"))}
                  value={draft.business.legalName}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      business: { ...draft.business, legalName: e.target.value },
                    })
                  }
                />
              )}
            </Field>
            <Field id="vendor-type" label={t("field.vendorType")}>
              {({ id }) => (
                <select
                  id={id}
                  value={draft.business.vendorType}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      business: {
                        ...draft.business,
                        vendorType: e.target.value as VendorType,
                      },
                    })
                  }
                  className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary"
                >
                  {VENDOR_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`vendorType.${type}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              id="trade-licence"
              label={t("field.tradeLicence")}
              error={errorText("business.tradeLicence")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("business.tradeLicence"))}
                  value={draft.business.tradeLicence}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      business: { ...draft.business, tradeLicence: e.target.value },
                    })
                  }
                />
              )}
            </Field>
            <Field id="tin" label={t("field.tin")} error={errorText("business.tin")}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("business.tin"))}
                  value={draft.business.tin}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      business: { ...draft.business, tin: e.target.value },
                    })
                  }
                />
              )}
            </Field>
            <Field id="bin" label={t("field.bin")} hint={t("hint.optional")}>
              {({ id }) => (
                <Input
                  id={id}
                  value={draft.business.bin ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      business: { ...draft.business, bin: e.target.value || null },
                    })
                  }
                />
              )}
            </Field>
            <Field id="years" label={t("field.yearsTrading")}>
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  value={draft.business.yearsTrading}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      business: {
                        ...draft.business,
                        yearsTrading: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                />
              )}
            </Field>
          </div>
        )}

        {current === "restaurant" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="rest-name"
                label={t("field.restaurantName")}
                error={errorText("restaurant.name")}
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(err("restaurant.name"))}
                    value={draft.restaurant.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        restaurant: { ...draft.restaurant, name: e.target.value },
                      })
                    }
                  />
                )}
              </Field>
              <Field
                id="rest-tagline"
                label={t("field.tagline")}
                error={errorText("restaurant.tagline")}
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(err("restaurant.tagline"))}
                    value={draft.restaurant.tagline}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        restaurant: { ...draft.restaurant, tagline: e.target.value },
                      })
                    }
                  />
                )}
              </Field>
              <Field
                id="rest-phone"
                label={t("field.contactPhone")}
                error={errorText("restaurant.phone")}
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="tel"
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(err("restaurant.phone"))}
                    value={draft.restaurant.phone}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        restaurant: { ...draft.restaurant, phone: e.target.value },
                      })
                    }
                  />
                )}
              </Field>
              <Field
                id="rest-email"
                label={t("field.contactEmail")}
                error={errorText("restaurant.email")}
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="email"
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(err("restaurant.email"))}
                    value={draft.restaurant.email}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        restaurant: { ...draft.restaurant, email: e.target.value },
                      })
                    }
                  />
                )}
              </Field>
              <Field
                id="rest-address"
                label={t("field.address")}
                error={errorText("restaurant.address")}
                className="sm:col-span-2"
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(err("restaurant.address"))}
                    value={draft.restaurant.location.address}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        restaurant: {
                          ...draft.restaurant,
                          location: {
                            ...draft.restaurant.location,
                            address: e.target.value,
                          },
                        },
                      })
                    }
                  />
                )}
              </Field>
              <Field id="rest-city" label={t("field.city")}>
                {({ id }) => (
                  <Input
                    id={id}
                    value={draft.restaurant.location.city}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        restaurant: {
                          ...draft.restaurant,
                          location: { ...draft.restaurant.location, city: e.target.value },
                        },
                      })
                    }
                  />
                )}
              </Field>
              <Field id="rest-price" label={t("field.priceLevel")}>
                {({ id }) => (
                  <select
                    id={id}
                    value={draft.restaurant.priceLevel}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        restaurant: {
                          ...draft.restaurant,
                          priceLevel: Number(e.target.value) as 1 | 2 | 3 | 4,
                        },
                      })
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
            </div>

            <Field
              id="rest-desc"
              label={t("field.description")}
              hint={t("hint.description")}
              error={errorText("restaurant.description")}
            >
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("restaurant.description"))}
                  rows={4}
                  value={draft.restaurant.description}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      restaurant: { ...draft.restaurant, description: e.target.value },
                    })
                  }
                  className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
                />
              )}
            </Field>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">
                {t("field.cuisines")}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {cuisines.map((cuisine) => {
                  const on = draft.restaurant.cuisineIds.includes(cuisine.id);
                  return (
                    <button
                      key={cuisine.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          restaurant: {
                            ...draft.restaurant,
                            cuisineIds: on
                              ? draft.restaurant.cuisineIds.filter((c) => c !== cuisine.id)
                              : [...draft.restaurant.cuisineIds, cuisine.id],
                          },
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
              {err("restaurant.cuisineIds") && (
                <p className="mt-1.5 text-xs font-medium text-danger">
                  {t(errors["restaurant.cuisineIds"])}
                </p>
              )}
            </fieldset>
          </div>
        )}

        {current === "hours" && (
          <div className="space-y-2">
            {WEEK.map((day) => {
              const hours = draft.hours[day];
              const closed = !hours.open || !hours.close;
              return (
                <div key={day} className="flex flex-wrap items-center gap-2">
                  <span className="w-14 text-sm font-semibold text-ink">
                    {t(`day.${day}`)}
                  </span>
                  <Input
                    type="time"
                    aria-label={t("openAt", { day: t(`day.${day}`) })}
                    disabled={closed}
                    value={hours.open ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        hours: {
                          ...draft.hours,
                          [day]: { ...hours, open: e.target.value },
                        },
                      })
                    }
                    className="w-32"
                  />
                  <span className="text-muted" aria-hidden>
                    –
                  </span>
                  <Input
                    type="time"
                    aria-label={t("closeAt", { day: t(`day.${day}`) })}
                    disabled={closed}
                    value={hours.close ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        hours: {
                          ...draft.hours,
                          [day]: { ...hours, close: e.target.value },
                        },
                      })
                    }
                    className="w-32"
                  />
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                    <input
                      type="checkbox"
                      checked={closed}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          hours: {
                            ...draft.hours,
                            [day]: e.target.checked
                              ? { open: null, close: null }
                              : { open: "10:00", close: "22:00" },
                          },
                        })
                      }
                      className="size-4 accent-primary"
                    />
                    {t("closed")}
                  </label>
                </div>
              );
            })}
            {err("hours.week") && (
              <p className="text-xs font-medium text-danger">{t(errors["hours.week"])}</p>
            )}
          </div>
        )}

        {current === "delivery" && (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">
                {t("field.fulfilment")}
              </legend>
              <div className="flex flex-wrap gap-3">
                {(["offersDelivery", "offersPickup"] as const).map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded-field border border-line px-3 py-2 text-sm text-body"
                  >
                    <input
                      type="checkbox"
                      checked={draft.delivery[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          delivery: { ...draft.delivery, [key]: e.target.checked },
                        })
                      }
                      className="size-4 accent-primary"
                    />
                    {t(key)}
                  </label>
                ))}
              </div>
              {err("delivery.mode") && (
                <p className="mt-1.5 text-xs font-medium text-danger">
                  {t(errors["delivery.mode"])}
                </p>
              )}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="fee" label={t("field.deliveryFee")}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    value={draft.delivery.deliveryFee}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        delivery: {
                          ...draft.delivery,
                          deliveryFee: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                )}
              </Field>
              <Field id="min-order" label={t("field.minOrder")}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    value={draft.delivery.minOrder}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        delivery: {
                          ...draft.delivery,
                          minOrder: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                )}
              </Field>
              <Field
                id="free-over"
                label={t("field.freeDeliveryOver")}
                hint={t("hint.freeDeliveryOver")}
              >
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    value={draft.delivery.freeDeliveryOver ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        delivery: {
                          ...draft.delivery,
                          freeDeliveryOver: e.target.value
                            ? Math.max(0, Number(e.target.value))
                            : null,
                        },
                      })
                    }
                  />
                )}
              </Field>
              <Field id="eta" label={t("field.eta")} error={errorText("delivery.eta")}>
                {({ id, describedBy }) => (
                  <div className="flex items-center gap-2">
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      aria-describedby={describedBy}
                      value={draft.delivery.etaMinutes[0]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          delivery: {
                            ...draft.delivery,
                            etaMinutes: [
                              Number(e.target.value) || 0,
                              draft.delivery.etaMinutes[1],
                            ],
                          },
                        })
                      }
                    />
                    <span className="text-muted" aria-hidden>
                      –
                    </span>
                    <Input
                      type="number"
                      min={1}
                      aria-label={t("field.etaHigh")}
                      value={draft.delivery.etaMinutes[1]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          delivery: {
                            ...draft.delivery,
                            etaMinutes: [
                              draft.delivery.etaMinutes[0],
                              Number(e.target.value) || 0,
                            ],
                          },
                        })
                      }
                    />
                  </div>
                )}
              </Field>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">
                {t("field.zones")}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {zones.map((zone) => {
                  const on = draft.delivery.zoneIds.includes(zone.id);
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          delivery: {
                            ...draft.delivery,
                            zoneIds: on
                              ? draft.delivery.zoneIds.filter((z) => z !== zone.id)
                              : [...draft.delivery.zoneIds, zone.id],
                          },
                        })
                      }
                      className={cn(
                        "rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-line text-body hover:bg-surface-muted",
                      )}
                    >
                      {zone.name}
                    </button>
                  );
                })}
              </div>
              {err("delivery.zoneIds") && (
                <p className="mt-1.5 text-xs font-medium text-danger">
                  {t(errors["delivery.zoneIds"])}
                </p>
              )}
            </fieldset>

            <BranchEditor
              branches={draft.branches}
              onChange={(branches) => setDraft({ ...draft, branches })}
            />
          </div>
        )}

        {current === "documents" && (
          <div className="space-y-3">
            <UploadNotice />
            <DocumentList
              documents={draft.documents}
              required={REQUIRED_VENDOR_DOCUMENTS}
              now={now}
              onUpload={(kind, reference) =>
                setDraft({
                  ...draft,
                  documents: draft.documents.map((d) =>
                    d.kind === kind ? submittedDocument(kind, reference, Date.now()) : d,
                  ),
                })
              }
            />
            {err("documents.required") && (
              <p className="text-xs font-medium text-danger">
                {t(errors["documents.required"])}
              </p>
            )}
          </div>
        )}

        {current === "payout" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="payout-method" label={t("field.payoutMethod")}>
              {({ id }) => (
                <select
                  id={id}
                  value={draft.payout.method}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payout: {
                        ...draft.payout,
                        method: e.target.value as (typeof PAYOUT_METHODS)[number],
                        // A mobile wallet has no branch, so switching clears it
                        // rather than leaving a stale routing number behind.
                        branch: e.target.value === "bank-transfer" ? draft.payout.branch : null,
                      },
                    })
                  }
                  className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary"
                >
                  {PAYOUT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {t(`payoutMethod.${method}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              id="payout-provider"
              label={t("field.provider")}
              error={errorText("payout.provider")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("payout.provider"))}
                  value={draft.payout.provider}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payout: { ...draft.payout, provider: e.target.value },
                    })
                  }
                />
              )}
            </Field>
            <Field
              id="payout-name"
              label={t("field.accountName")}
              error={errorText("payout.accountName")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("payout.accountName"))}
                  value={draft.payout.accountName}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payout: { ...draft.payout, accountName: e.target.value },
                    })
                  }
                />
              )}
            </Field>
            <Field
              id="payout-number"
              label={t("field.accountNumber")}
              error={errorText("payout.accountNumber")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("payout.accountNumber"))}
                  value={draft.payout.accountNumber}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payout: { ...draft.payout, accountNumber: e.target.value },
                    })
                  }
                />
              )}
            </Field>
            {draft.payout.method === "bank-transfer" && (
              <Field
                id="payout-branch"
                label={t("field.branchCode")}
                error={errorText("payout.branch")}
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(err("payout.branch"))}
                    value={draft.payout.branch ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        payout: { ...draft.payout, branch: e.target.value },
                      })
                    }
                  />
                )}
              </Field>
            )}
          </div>
        )}

        {current === "review" && (
          <div className="space-y-3">
            <p className="text-sm text-body">{t("reviewIntro")}</p>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {[
                [t("field.restaurantName"), draft.restaurant.name],
                [t("field.legalName"), draft.business.legalName],
                [t("field.ownerName"), draft.owner.name],
                [t("field.address"), draft.restaurant.location.address],
                [t("field.tradeLicence"), draft.business.tradeLicence],
                [
                  t("field.documents"),
                  String(draft.documents.filter((d) => d.status !== "missing").length),
                ],
                [t("field.payoutMethod"), t(`payoutMethod.${draft.payout.method}`)],
                [t("field.branches"), String(draft.branches.length)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">
                    {label}
                  </dt>
                  <dd className="truncate text-sm text-ink">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            {Object.keys(allErrors).length > 0 && (
              <p className="rounded-card border border-danger/30 bg-danger/5 p-3 text-sm font-semibold text-danger">
                {t("reviewIncomplete", { count: Object.keys(allErrors).length })}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <Button
            variant="ghost"
            size="sm"
            disabled={step === 0}
            onClick={() => {
              setTouched(false);
              setStep((s) => Math.max(0, s - 1));
            }}
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("back")}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={submitting} onClick={() => save(false)}>
              {t("saveDraft")}
            </Button>
            {current === "review" ? (
              <Button size="sm" disabled={submitting} onClick={() => save(true)}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="size-4" aria-hidden />
                )}
                {t("submitApplication")}
              </Button>
            ) : (
              <Button size="sm" onClick={next}>
                {t("continue")}
                <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Additional outlets.
 *
 * Collected because the spec asks for "branches where supported", and recorded on
 * the application rather than turned into catalog listings — the prototype's
 * `Vendor` has one location, and minting a second listing that shares a menu would
 * be a branch a customer could order from and nobody could fulfil.
 */
function BranchEditor({
  branches,
  onChange,
}: {
  branches: VendorBranch[];
  onChange: (branches: VendorBranch[]) => void;
}) {
  const t = useTranslations("onboarding");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [phone, setPhone] = useState("");

  const ready = name.trim() && address.trim() && area.trim() && phone.trim();

  return (
    <fieldset className="rounded-card border border-line p-3.5">
      <legend className="px-1 text-sm font-semibold text-ink">{t("field.branches")}</legend>
      <p className="text-xs text-muted">{t("hint.branches")}</p>

      {branches.length > 0 && (
        <ul className="mt-3 space-y-2">
          {branches.map((branch) => (
            <li key={branch.id} className="flex items-start gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{branch.name}</span>
                <span className="block text-xs text-muted">
                  {branch.address} · {branch.area} · {branch.phone}
                </span>
              </span>
              <button
                type="button"
                aria-label={t("removeBranch", { name: branch.name })}
                onClick={() => onChange(branches.filter((b) => b.id !== branch.id))}
                className="text-danger transition-colors hover:opacity-70"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("field.branchName")}
          aria-label={t("field.branchName")}
        />
        <Input
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder={t("field.area")}
          aria-label={t("field.area")}
        />
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t("field.address")}
          aria-label={t("field.address")}
        />
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("field.phone")}
          aria-label={t("field.phone")}
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        disabled={!ready}
        onClick={() => {
          onChange([
            ...branches,
            {
              // Derived from the name so adding the same branch twice by
              // double-tapping produces one entry.
              id: `brn_${name.trim().toLowerCase().replace(/\s+/g, "-")}`,
              name: name.trim(),
              address: address.trim(),
              area: area.trim(),
              phone: phone.trim(),
              hours: null,
            },
          ]);
          setName("");
          setAddress("");
          setArea("");
          setPhone("");
        }}
      >
        <Plus className="size-4" aria-hidden />
        {t("addBranch")}
      </Button>
    </fieldset>
  );
}

/** What an applicant sees once their application is with the platform. */
function ApplicationStatusPanel({ application }: { application: VendorApplication }) {
  const t = useTranslations("onboarding");
  return (
    <div className="space-y-4">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h2 text-ink">{application.restaurant.name}</h1>
          <OnboardingStatusChip status={application.status} />
        </div>
        <p className="mt-1 font-mono text-sm text-muted">{application.applicationNumber}</p>
      </header>

      <p className="text-body">{t(`applicantStatus.${application.status}`)}</p>

      {application.decisionNote && (
        <p className="rounded-card border border-line bg-surface p-3 text-sm text-body">
          {application.decisionNote}
        </p>
      )}

      {application.status === "approved" && (
        <Button href="/dashboard">{t("openDashboard")}</Button>
      )}

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-bold text-ink">{t("section.log")}</h2>
        <ApplicationLog events={application.events} />
      </section>
    </div>
  );
}
