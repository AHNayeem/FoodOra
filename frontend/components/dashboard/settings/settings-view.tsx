"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clock, Loader2, RotateCcw } from "lucide-react";
import type { VendorApplication, WeeklyHours } from "@/types";
import { useAuth } from "@/stores/auth";
import { useOnboarding } from "@/stores/onboarding";
import { useStaff } from "@/stores/staff";
import { useVendorSettings } from "@/stores/vendor-settings";
import { effectiveSettings } from "@/lib/vendor-settings";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useDashboard } from "../dashboard-context";
import { BranchesPanel } from "./branches-panel";
import { DeliveryPanel } from "./delivery-panel";
import { HoursEditor } from "./hours-editor";
import { ProfilePanel } from "./profile-panel";
import { StaffPanel } from "./staff-panel";

const TABS = ["profile", "hours", "delivery", "branches", "staff"] as const;
type Tab = (typeof TABS)[number];

/**
 * SettingsView — everything a restaurant can change about itself (Phase 10, G18 +
 * G24).
 *
 * One route with tabs rather than five nav entries. The dashboard sidebar already
 * carries ten items and a kitchen scrolls it on a phone; the spec groups these as
 * "restaurant settings" and "staff", which is two things a person opens the same
 * screen for. The tabs are the pattern the order board and the payout run already
 * use.
 *
 * Everything on the page reads **one fold**. `lib/vendor-settings.effectiveSettings`
 * resolves the listing, the contact details, the rota, the delivery terms and the
 * branches from three sources — the catalog seed, the onboarding application, and
 * this restaurant's draft — and every panel is handed the result. So no panel has
 * to know where a value came from, and the topbar above them shows the same name
 * they are editing, because `DashboardShell` folds with the same function.
 */
export function SettingsView() {
  const t = useTranslations("vendorSettings");
  const format = useFormatter();
  const { vendor } = useDashboard();

  const user = useAuth((s) => s.user);
  const authHydrated = useAuth((s) => s.hydrated);

  const drafts = useVendorSettings((s) => s.drafts);
  const settingsHydrated = useVendorSettings((s) => s.hydrated);
  const draftFor = useVendorSettings((s) => s.draftFor);
  const resetVendor = useVendorSettings((s) => s.resetVendor);
  const saveHours = useVendorSettings((s) => s.saveHours);

  const applications = useOnboarding((s) => s.vendorApplications);
  const onboardingHydrated = useOnboarding((s) => s.hydrated);

  const ensureOwner = useStaff((s) => s.ensureOwner);
  const staffHydrated = useStaff((s) => s.hydrated);

  const [tab, setTab] = useState<Tab>("profile");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    useVendorSettings.persist.rehydrate();
    useStaff.persist.rehydrate();
    // The shell already rehydrates auth and onboarding, but this page is reachable
    // directly and must not read either before it has.
    useAuth.persist.rehydrate();
    useOnboarding.persist.rehydrate();
  }, []);

  /**
   * This restaurant's onboarding record — the home of its phone number, its
   * branches, and the terms it was approved on.
   *
   * Looked up by vendor id, which is the same lookup `DashboardShell` does. The
   * shell has already established that this account may manage this restaurant, so
   * an absent record here is a data gap rather than an access question, and the
   * panels that need it say so rather than silently offering nothing.
   */
  const application: VendorApplication | null = useMemo(
    () =>
      applications.find((a) => a.vendorId === vendor.id && !a.deletedAt) ?? null,
    [applications, vendor.id],
  );

  const draft = useMemo(
    () => drafts[vendor.id] ?? draftFor(vendor.id),
    [drafts, vendor.id, draftFor],
  );

  const settings = useMemo(
    () => effectiveSettings(vendor, application, draft),
    [vendor, application, draft],
  );

  // The owner's own staff record is minted once the account and the store are both
  // readable. Idempotent — see `stores/staff.ensureOwner`.
  useEffect(() => {
    if (!staffHydrated || !user) return;
    ensureOwner(vendor, user);
  }, [staffHydrated, user, vendor, ensureOwner]);

  const ready = authHydrated && settingsHydrated && onboardingHydrated && staffHydrated;

  if (!ready) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-64 animate-pulse rounded-pill bg-surface" />
        <div className="h-10 w-full animate-pulse rounded-pill bg-surface" />
        <div className="h-96 animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        {settings.authored && (
          <span className="flex flex-wrap items-center gap-2">
            {settings.updatedAt && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted">
                <Clock className="size-3.5" aria-hidden />
                {t("lastSaved", {
                  when: format.relativeTime(new Date(settings.updatedAt)),
                })}
              </span>
            )}
            {/* Discarding is offered because the draft is a diff: the published
                listing is still there underneath and going back to it is one
                action, not an undo history. Confirmed, because it is not
                reversible. */}
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="size-4" aria-hidden />
              {t("discard")}
            </Button>
          </span>
        )}
      </header>

      <div
        role="tablist"
        aria-label={t("title")}
        className="flex gap-1.5 overflow-x-auto border-b border-line pb-px"
      >
        {TABS.map((key) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={cn(
                "shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t(`tab.${key}`)}
            </button>
          );
        })}
      </div>

      {tab === "profile" && <ProfilePanel settings={settings} />}

      {tab === "hours" && (
        <HoursPanel
          hours={settings.hours}
          onSave={(hours) => saveHours(vendor.id, hours)}
        />
      )}

      {tab === "delivery" && <DeliveryPanel settings={settings} />}

      {tab === "branches" && (
        <BranchesPanel
          settings={settings}
          application={application}
          authorName={user?.name ?? vendor.name}
        />
      )}

      {tab === "staff" &&
        (user ? (
          <StaffPanel vendor={vendor} currentUser={user} />
        ) : (
          <p className="rounded-card border border-line bg-surface p-8 text-center text-sm text-muted">
            {t("staff.noAccount")}
          </p>
        ))}

      {confirmReset && (
        <ConfirmDialog
          open
          title={t("discardTitle")}
          body={t("discardBody")}
          confirmLabel={t("discard")}
          tone="danger"
          onClose={() => setConfirmReset(false)}
          onConfirm={() => {
            resetVendor(vendor.id);
            setConfirmReset(false);
            toast.success(t("discarded"));
          }}
        />
      )}
    </div>
  );
}

/**
 * The rota, and the one save button it needs.
 *
 * Its own component only so the form state is local: the editor is shared with the
 * branch dialog and takes `hours` as a prop, so somebody has to hold the edits
 * between keystroke and save, and that somebody should not be the whole page.
 */
function HoursPanel({
  hours,
  onSave,
}: {
  hours: WeeklyHours;
  onSave: (hours: WeeklyHours) => { errors: Record<string, string> };
}) {
  const t = useTranslations("vendorSettings");
  const [form, setForm] = useState<WeeklyHours>(() => ({ ...hours }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card">
      <h2 className="text-sm font-bold text-ink">{t("hours.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("hours.subtitle")}</p>

      <div className="mt-4">
        <HoursEditor
          hours={form}
          errors={errors}
          disabled={saving}
          onChange={setForm}
        />
      </div>

      {errors.week && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {t(errors.week)}
        </p>
      )}

      {/* Overnight service is normal for half this catalog, so the validator
          checks parsability rather than `open < close`. Said here so a late-night
          kitchen does not assume 02:00 was rejected. */}
      <p className="mt-3 text-xs text-muted">{t("hours.overnight")}</p>

      <div className="mt-4 flex justify-end">
        <Button
          disabled={saving}
          onClick={() => {
            setSaving(true);
            const { errors: next } = onSave(form);
            setSaving(false);
            setErrors(next);
            if (Object.keys(next).length) {
              toast.error(t("saveFailed"));
              return;
            }
            toast.success(t("saved"));
          }}
        >
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t("save")}
        </Button>
      </div>
    </section>
  );
}
