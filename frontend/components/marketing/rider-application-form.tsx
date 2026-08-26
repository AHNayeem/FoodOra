"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import type { DeliveryZone, RiderApplication, RiderVehicle, User } from "@/types";
import { useAuth } from "@/stores/auth";
import { useOnboarding } from "@/stores/onboarding";
import {
  MIN_RIDER_AGE,
  RIDER_STEPS,
  emptyRiderDraft,
  requiredRiderDocuments,
  riderStepErrors,
  type RiderApplicationDraft,
  type RiderStep,
} from "@/lib/rider-onboarding";
import { PAYOUT_METHODS, submittedDocument } from "@/lib/onboarding";
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

const VEHICLES: readonly RiderVehicle[] = ["bike", "scooter", "bicycle", "car"];

/**
 * RiderApplicationForm — the courier application (Phase 7, G10).
 *
 * `/rider` used to be a pitch page whose call to action was `/register`, and
 * `RegisterInput.role` did not even include `delivery-rider` — so there was no way
 * to become one. This is the form: personal details, contact and an emergency
 * contact, the vehicle, documents with their states, and where earnings are paid.
 *
 * Built to the same three rules as the restaurant form (steps from the domain's
 * list, per-step validation re-run in full at submit, an existing application shown
 * rather than silently replaced). Two rider-specific decisions:
 *
 *  - **The vehicle changes the paperwork.** A bicycle needs no licence, no
 *    registration and no insurance, so the required-documents list is a function of
 *    it (`requiredRiderDocuments`) rather than a fixed five. Asking a cyclist for a
 *    driving licence would make the commonest vehicle in the city un-onboardable.
 *  - **The emergency contact may not be the rider's own number.** Enforced in
 *    `riderStepErrors`, because a contact that rings the phone in the crashed
 *    rider's pocket is not an emergency contact.
 */
export function RiderApplicationForm() {
  const user = useAuth((s) => s.user);
  const authHydrated = useAuth((s) => s.hydrated);
  const hydrated = useOnboarding((s) => s.hydrated);
  const applications = useOnboarding((s) => s.riderApplications);

  useEffect(() => {
    useAuth.persist.rehydrate();
    useOnboarding.persist.rehydrate();
  }, []);

  const existing: RiderApplication | undefined = user
    ? applications.find((a) => a.userId === user.id && !a.deletedAt)
    : undefined;

  if (!authHydrated || !hydrated) {
    return <div className="h-96 animate-pulse rounded-card bg-surface" />;
  }

  if (existing && existing.status !== "draft" && existing.status !== "rejected") {
    return <RiderStatusPanel application={existing} />;
  }

  return <RiderWizard user={user} existing={existing} />;
}

/**
 * The wizard proper — see `PartnerWizard` for why this is a separate component:
 * it mounts once the session is known, so the draft is prefilled in its initial
 * state rather than corrected by an effect afterwards.
 */
function RiderWizard({
  user,
  existing,
}: {
  user: User | null;
  existing: RiderApplication | undefined;
}) {
  const t = useTranslations("onboarding");
  const td = useTranslations("dashboard");
  const applyAsRider = useOnboarding((s) => s.applyAsRider);
  const submitRider = useOnboarding((s) => s.submitRider);

  const [draft, setDraft] = useState<RiderApplicationDraft>(() => {
    const blank = emptyRiderDraft();
    return user
      ? {
          ...blank,
          personal: { ...blank.personal, name: user.name },
          contact: { phone: user.phone ?? "", email: user.email },
        }
      : blank;
  });
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [now] = useState(() => Date.now());

  // Only the zones the platform runs (Phase 19, G30) — see the partner form.
  const platform = usePlatformDraft();

  useEffect(() => {
    getDeliveryZones(platform).then((list) => {
      setZones(list);
      // Default to the first zone rather than leaving the field empty: every zone
      // is a valid answer, and an unset one is the commonest reason a rider
      // bounces off the vehicle step.
      setDraft((d) => (d.zoneId ? d : { ...d, zoneId: list[0]?.id ?? "" }));
    });
  }, [platform]);

  const current: RiderStep = RIDER_STEPS[step];
  const errors = useMemo(() => riderStepErrors(draft, current), [draft, current]);
  const allErrors = useMemo(() => riderStepErrors(draft, "review"), [draft]);
  const err = (field: string) => (touched ? errors[field] : undefined);
  const errorText = (field: string) => {
    const key = err(field);
    return key ? t(key) : undefined;
  };

  const required = requiredRiderDocuments(draft.vehicleInfo.vehicle);
  const motorised = draft.vehicleInfo.vehicle !== "bicycle";

  function next() {
    setTouched(true);
    if (Object.keys(errors).length > 0) return;
    setTouched(false);
    setStep((s) => Math.min(s + 1, RIDER_STEPS.length - 1));
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
    const application = applyAsRider({
      draft,
      userId: user?.id ?? null,
      submit,
      by: user?.name ?? draft.personal.name,
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
        <h1 className="text-h2 text-ink">{t("riderTitle")}</h1>
        <p className="mt-1 text-body">{t("riderSubtitle")}</p>
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
              const result = submitRider(
                existing.id,
                user?.name ?? existing.personal.name,
              );
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
        steps={RIDER_STEPS}
        current={step}
        labelOf={(s) => t(`riderStep.${s}`)}
        onGo={(index) => {
          setTouched(false);
          setStep(index);
        }}
      />

      <section className="space-y-4 rounded-card border border-line bg-surface p-5">
        <div>
          <h2 className="text-h3 text-ink">{t(`riderStep.${current}`)}</h2>
          <p className="mt-1 text-sm text-muted">{t(`riderStepHint.${current}`)}</p>
        </div>

        {current === "personal" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="rider-name"
              label={t("field.fullName")}
              error={errorText("personal.name")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("personal.name"))}
                  value={draft.personal.name}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      personal: { ...draft.personal, name: e.target.value },
                    })
                  }
                />
              )}
            </Field>
            <Field
              id="rider-dob"
              label={t("field.dateOfBirth")}
              hint={t("hint.minAge", { age: MIN_RIDER_AGE })}
              error={errorText("personal.dateOfBirth")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="date"
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("personal.dateOfBirth"))}
                  value={draft.personal.dateOfBirth}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      personal: { ...draft.personal, dateOfBirth: e.target.value },
                    })
                  }
                />
              )}
            </Field>
            <Field
              id="rider-nid"
              label={t("field.nationalId")}
              error={errorText("personal.nationalId")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("personal.nationalId"))}
                  value={draft.personal.nationalId}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      personal: { ...draft.personal, nationalId: e.target.value },
                    })
                  }
                />
              )}
            </Field>
            <Field
              id="rider-area"
              label={t("field.area")}
              error={errorText("personal.area")}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("personal.area"))}
                  value={draft.personal.area}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      personal: { ...draft.personal, area: e.target.value },
                    })
                  }
                />
              )}
            </Field>
            <Field
              id="rider-address"
              label={t("field.address")}
              error={errorText("personal.address")}
              className="sm:col-span-2"
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("personal.address"))}
                  value={draft.personal.address}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      personal: { ...draft.personal, address: e.target.value },
                    })
                  }
                />
              )}
            </Field>
            <Field id="rider-city" label={t("field.city")}>
              {({ id }) => (
                <Input
                  id={id}
                  value={draft.personal.city}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      personal: { ...draft.personal, city: e.target.value },
                    })
                  }
                />
              )}
            </Field>
          </div>
        )}

        {current === "contact" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="rider-phone"
                label={t("field.phone")}
                error={errorText("contact.phone")}
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="tel"
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(err("contact.phone"))}
                    value={draft.contact.phone}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        contact: { ...draft.contact, phone: e.target.value },
                      })
                    }
                  />
                )}
              </Field>
              <Field
                id="rider-email"
                label={t("field.email")}
                error={errorText("contact.email")}
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="email"
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(err("contact.email"))}
                    value={draft.contact.email}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        contact: { ...draft.contact, email: e.target.value },
                      })
                    }
                  />
                )}
              </Field>
            </div>

            <fieldset className="rounded-card border border-line p-3.5">
              <legend className="px-1 text-sm font-semibold text-ink">
                {t("section.emergency")}
              </legend>
              <p className="text-xs text-muted">{t("hint.emergency")}</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <Field
                  id="em-name"
                  label={t("field.emergencyName")}
                  error={errorText("emergency.name")}
                >
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={Boolean(err("emergency.name"))}
                      value={draft.emergency.name}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          emergency: { ...draft.emergency, name: e.target.value },
                        })
                      }
                    />
                  )}
                </Field>
                <Field
                  id="em-rel"
                  label={t("field.emergencyRelationship")}
                  error={errorText("emergency.relationship")}
                >
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={Boolean(err("emergency.relationship"))}
                      value={draft.emergency.relationship}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          emergency: {
                            ...draft.emergency,
                            relationship: e.target.value,
                          },
                        })
                      }
                    />
                  )}
                </Field>
                <Field
                  id="em-phone"
                  label={t("field.emergencyPhone")}
                  error={errorText("emergency.phone")}
                >
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      type="tel"
                      aria-describedby={describedBy}
                      aria-invalid={Boolean(err("emergency.phone"))}
                      value={draft.emergency.phone}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          emergency: { ...draft.emergency, phone: e.target.value },
                        })
                      }
                    />
                  )}
                </Field>
              </div>
            </fieldset>
          </div>
        )}

        {current === "vehicle" && (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">
                {t("field.vehicle")}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {VEHICLES.map((vehicle) => (
                  <button
                    key={vehicle}
                    type="button"
                    aria-pressed={draft.vehicleInfo.vehicle === vehicle}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        vehicleInfo:
                          vehicle === "bicycle"
                            ? // Switching to a bicycle clears the fields a bicycle
                              // does not have, rather than carrying a plate that no
                              // longer belongs to anything.
                              { vehicle, plate: null, model: null, licenceNumber: null }
                            : { ...draft.vehicleInfo, vehicle },
                      })
                    }
                    className={cn(
                      "rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors",
                      draft.vehicleInfo.vehicle === vehicle
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-line text-body hover:bg-surface-muted",
                    )}
                  >
                    {td(`vehicle.${vehicle}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            {motorised && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="plate"
                  label={t("field.plate")}
                  error={errorText("vehicleInfo.plate")}
                >
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={Boolean(err("vehicleInfo.plate"))}
                      value={draft.vehicleInfo.plate ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          vehicleInfo: {
                            ...draft.vehicleInfo,
                            plate: e.target.value || null,
                          },
                        })
                      }
                    />
                  )}
                </Field>
                <Field
                  id="licence"
                  label={t("field.licenceNumber")}
                  error={errorText("vehicleInfo.licenceNumber")}
                >
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={Boolean(err("vehicleInfo.licenceNumber"))}
                      value={draft.vehicleInfo.licenceNumber ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          vehicleInfo: {
                            ...draft.vehicleInfo,
                            licenceNumber: e.target.value || null,
                          },
                        })
                      }
                    />
                  )}
                </Field>
                <Field id="model" label={t("field.model")} hint={t("hint.optional")}>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={draft.vehicleInfo.model ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          vehicleInfo: {
                            ...draft.vehicleInfo,
                            model: e.target.value || null,
                          },
                        })
                      }
                    />
                  )}
                </Field>
              </div>
            )}

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">
                {t("field.zone")}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {zones.map((zone) => (
                  <button
                    key={zone.id}
                    type="button"
                    aria-pressed={draft.zoneId === zone.id}
                    onClick={() => setDraft({ ...draft, zoneId: zone.id })}
                    className={cn(
                      "rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors",
                      draft.zoneId === zone.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-line text-body hover:bg-surface-muted",
                    )}
                  >
                    {zone.name}
                  </button>
                ))}
              </div>
              {err("zoneId") && (
                <p className="mt-1.5 text-xs font-medium text-danger">
                  {t(errors.zoneId)}
                </p>
              )}
            </fieldset>
          </div>
        )}

        {current === "documents" && (
          <div className="space-y-3">
            <UploadNotice />
            <p className="text-sm text-muted">
              {t(motorised ? "hint.docsMotorised" : "hint.docsBicycle")}
            </p>
            <DocumentList
              documents={draft.documents}
              required={required}
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
            <Field id="r-payout-method" label={t("field.payoutMethod")}>
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
                        branch:
                          e.target.value === "bank-transfer" ? draft.payout.branch : null,
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
              id="r-payout-provider"
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
              id="r-payout-name"
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
              id="r-payout-number"
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
                id="r-payout-branch"
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
            <p className="text-sm text-body">{t("riderReviewIntro")}</p>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {[
                [t("field.fullName"), draft.personal.name],
                [t("field.phone"), draft.contact.phone],
                [t("field.vehicle"), td(`vehicle.${draft.vehicleInfo.vehicle}`)],
                [t("field.zone"), zones.find((z) => z.id === draft.zoneId)?.name ?? ""],
                [t("field.emergencyName"), draft.emergency.name],
                [
                  t("field.documents"),
                  String(draft.documents.filter((d) => d.status !== "missing").length),
                ],
                [t("field.payoutMethod"), t(`payoutMethod.${draft.payout.method}`)],
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
            <Button
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => save(false)}
            >
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

/** What an applicant sees once their application is with the platform. */
function RiderStatusPanel({ application }: { application: RiderApplication }) {
  const t = useTranslations("onboarding");
  return (
    <div className="space-y-4">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h2 text-ink">{application.personal.name}</h1>
          <OnboardingStatusChip status={application.status} />
        </div>
        <p className="mt-1 font-mono text-sm text-muted">
          {application.applicationNumber}
        </p>
      </header>

      <p className="text-body">{t(`riderApplicantStatus.${application.status}`)}</p>

      {application.decisionNote && (
        <p className="rounded-card border border-line bg-surface p-3 text-sm text-body">
          {application.decisionNote}
        </p>
      )}

      {application.status === "approved" && (
        <Button href="/delivery">{t("openRiderApp")}</Button>
      )}

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-bold text-ink">{t("section.log")}</h2>
        <ApplicationLog events={application.events} />
      </section>
    </div>
  );
}
