"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clock, Globe, MapPin, Percent, RotateCcw, Route } from "lucide-react";
import { usePlatformSettings, usePlatformDraft } from "@/stores/platform-settings";
import { useCan } from "@/stores/auth";
import { platformSettingsOf, savePlatformSettings } from "@/services/platform-settings";
import { networkReach } from "@/lib/platform-settings";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { ReadOnlyNotice } from "../read-only-notice";
import { RegionsPanel } from "./regions-panel";
import { ZonesPanel } from "./zones-panel";

const TABS = ["regions", "zones"] as const;
type Tab = (typeof TABS)[number];

/**
 * PlatformSettingsView — the platform's own configuration (Phase 19, G30).
 *
 * G30 was filed as "no settings route: tax rates, delivery-fee rules and zone
 * parameters are hard-coded in `config/regions.ts` and `lib/mock/delivery-zones.ts`",
 * and both of those files had said in their own headers what they were waiting
 * for. This is the surface they were waiting for.
 *
 * **Nothing here is a second configuration.** The two files are still the tables;
 * this screen edits a *diff* over them, `lib/platform-settings.effectiveSettings`
 * folds it back, and every surface in the app reads the fold. That is why the two
 * panels are worth reading as one screen rather than two features: the tax rate on
 * the left is the rate the customer's checkout charges, the POS charges and the
 * dine-in bill charges, and the zones on the right are the network the location
 * picker offers, dispatch prefers couriers from, and the courier's wallet is
 * priced by. A settings page whose settings only the settings page could see would
 * be the version of this phase that changed nothing.
 *
 * One route with tabs rather than two nav entries, matching the restaurant's own
 * settings screen: the admin sidebar already carries thirteen items, and "regions"
 * and "zones" are two questions a person opens the same screen for.
 *
 * Gated on `settings.manage` — the permission Phase 14 defined and left with
 * nothing behind it. An account that may *see* platform operations but not
 * configure it gets the screen read-only above a `ReadOnlyNotice`, which is the
 * convention Phase 14 settled: a section you cannot see is hidden by the shell, an
 * action you cannot take stays visible and disabled with the permission named.
 */
export function PlatformSettingsView() {
  const t = useTranslations("platformSettings");
  const format = useFormatter();

  const mayManage = useCan("settings", "manage");
  const hydrated = usePlatformSettings((s) => s.hydrated);
  const reset = usePlatformSettings((s) => s.reset);
  const draft = usePlatformDraft();

  const [tab, setTab] = useState<Tab>("regions");
  const [confirmReset, setConfirmReset] = useState(false);

  const settings = useMemo(() => platformSettingsOf(draft), [draft]);
  const reach = useMemo(() => networkReach(settings.zones), [settings.zones]);
  const openRegions = settings.regions.filter((r) => r.active);
  const defaultRegion = settings.regions.find(
    (r) => r.country.code === settings.defaultCountry,
  );

  /**
   * Publish the configuration through the seam whenever it changes.
   *
   * The store is what persists it on this device; this is the write a real API
   * replaces, and it runs here rather than inside each action so that the eight
   * mutations do not each have to remember to. It is deliberately fire-and-forget:
   * the mock endpoint echoes what it was given, and a screen that blocked its own
   * save button on a simulated round trip would be teaching a reviewer a latency
   * that will not exist.
   */
  useEffect(() => {
    if (!hydrated) return;
    void savePlatformSettings(draft);
  }, [draft, hydrated]);

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-72 animate-pulse rounded-pill bg-surface" />
        <div className="h-24 w-full animate-pulse rounded-card bg-surface" />
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
            {/* Offered because the edits are a diff: the config and the seed are
                still underneath, so going back to them is one action rather than
                an undo history. Confirmed, because it is not reversible. */}
            <Button
              variant="ghost"
              size="sm"
              disabled={!mayManage}
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw className="size-4" aria-hidden />
              {t("discard")}
            </Button>
          </span>
        )}
      </header>

      {!mayManage && <ReadOnlyNotice permission="settings.manage" />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("statRegions")}
          value={String(openRegions.length)}
          icon={Globe}
          hint={t("statRegionsHint", { total: settings.regions.length })}
        />
        <StatCard
          label={t("statTax")}
          value={
            defaultRegion
              ? `${Math.round(defaultRegion.country.taxRate * 10_000) / 100}%`
              : "—"
          }
          icon={Percent}
          hint={t("statTaxHint", {
            country: defaultRegion?.country.name ?? "—",
            label: defaultRegion?.country.taxLabel ?? "—",
          })}
        />
        <StatCard
          label={t("statZones")}
          value={String(reach.openZones)}
          icon={MapPin}
          hint={t("statZonesHint", { total: settings.zones.length })}
        />
        <StatCard
          label={t("statAreas")}
          value={String(reach.areas)}
          icon={Route}
          hint={t("statAreasHint")}
        />
      </div>

      {/* The one thing a reviewer has to know before they change anything: this
          is a device-local configuration, because the prototype has no server. */}
      <p className="rounded-field bg-surface-muted p-3 text-xs text-muted">
        {t("deviceNote")}
      </p>

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

      {tab === "regions" && <RegionsPanel settings={settings} editable={mayManage} />}
      {tab === "zones" && <ZonesPanel settings={settings} editable={mayManage} />}

      {confirmReset && (
        <ConfirmDialog
          open
          title={t("discardTitle")}
          body={t("discardBody")}
          confirmLabel={t("discard")}
          tone="danger"
          onClose={() => setConfirmReset(false)}
          onConfirm={() => {
            reset();
            setConfirmReset(false);
            toast.success(t("discarded"));
          }}
        />
      )}
    </div>
  );
}
