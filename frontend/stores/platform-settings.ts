"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  DeliveryZone,
  PlatformSettings,
  PlatformSettingsDraft,
  TaxTerms,
} from "@/types";
import { countries } from "@/config/regions";
import { deliveryZones } from "@/lib/mock";
import {
  effectiveSettings,
  emptyPlatformDraft,
  isPlatformDraftEmpty,
  saveRegion,
  saveZone,
  serviceableZones,
  setDefaultCountry,
  setRegionActive,
  setZoneActive,
  taxFor,
  type PlatformSettingsError,
  type ZoneInput,
} from "@/lib/platform-settings";
import { syncAcrossWindows } from "@/lib/store-sync";
import { recordAudit } from "./audit";

/**
 * platform-settings store — the platform's own configuration, as this device has
 * changed it (Phase 19, G30).
 *
 * `config/regions.ts` is a module-scope `const` and `lib/mock/delivery-zones.ts` is
 * a seeded array, so an operator's edit has nowhere to be written. It is written
 * here as a **diff** — the same arrangement `stores/vendor-settings` uses for an
 * edited listing and `stores/menu` for an authored menu — and
 * `lib/platform-settings.effectiveSettings` folds it back over the two baselines.
 * That fold is the only reader.
 *
 * Four rules, matching the other stores:
 *
 *  1. **Every mutation goes through `lib/platform-settings`.** Nothing here writes
 *     a field or decides what is acceptable, so a form cannot save a tax rate that
 *     would price every order on the platform wrong, or close the last zone and
 *     leave the storefront with nowhere to deliver.
 *  2. **One draft, not one per section.** A platform has one configuration; a save
 *     to the tax table and a save to a zone are edits to the same record and share
 *     one `updatedAt`.
 *  3. **This is the store the *other* surfaces read.** The customer's location
 *     picker, the checkout, the POS, the dine-in bill, the courier's wallet and
 *     dispatch all resolve their configuration from here, through the seam. That is
 *     the point of the phase: settings that only the settings screen could see
 *     would be a settings screen, not a configuration.
 *  4. **Synced across windows.** It is registered with `lib/store-sync` for the
 *     reason the eleven shared-domain stores are: the admin changes a zone in one
 *     window and the customer's tab beside it has to stop offering the area. A
 *     configuration that reached one tab would be worse than none, because the two
 *     would disagree about whether an order could be placed.
 *
 * Phase E replays these patches as mutations on the server's own tables; the draft
 * becomes an optimistic cache and the action signatures stay put.
 */

const STORE_VERSION = 1;

/** What a mutation answers with. Empty `errors` means it committed. */
interface SaveResult {
  errors: Record<string, PlatformSettingsError>;
}

interface PlatformSettingsState {
  /** The diff over `config/regions.ts` and `lib/mock/delivery-zones.ts`. */
  draft: PlatformSettingsDraft;
  hydrated: boolean;

  // -- reads -------------------------------------------------------------
  /** The whole configuration, folded. What the admin screen renders. */
  settings: () => PlatformSettings;
  /** Has an operator changed anything on this device? */
  authored: () => boolean;

  // -- writes ------------------------------------------------------------
  saveRegion: (code: string, input: { taxRate: number; taxLabel: string }) => SaveResult;
  setRegionActive: (code: string, active: boolean) => SaveResult;
  setDefaultCountry: (code: string) => SaveResult;
  saveZone: (zoneId: string, input: ZoneInput) => SaveResult;
  setZoneActive: (zoneId: string, active: boolean) => SaveResult;

  // -- lifecycle ---------------------------------------------------------
  /** Throw every edit away and go back to the config and the seed. */
  reset: () => void;
  resetDemo: () => void;
  setHydrated: () => void;
}

/**
 * Record one configuration change (Phase 15) — §6's "settings changes".
 *
 * Which *section* and which *record*, not which fields, and that is the same
 * deliberate limit `stores/vendor-settings.auditSave` states: the draft is a diff,
 * and a field-level trail would mean diffing the diff on every save and storing
 * the old value beside the new one. The section and the record name are what
 * somebody auditing asks for — "who widened the Uttara zone, and when" — and the
 * draft's own `updatedAt` has the rest.
 *
 * `settings.changed` is reused rather than a new action minted: it already means
 * "somebody changed configuration", and the `entity` is what says whose. A
 * `platform.changed` beside it would give the audit filter two answers to one
 * question.
 */
function auditChange(
  entity: "region" | "delivery-zone" | "platform",
  entityId: string,
  section: string,
  name: string,
): void {
  recordAudit({
    action: "settings.changed",
    entity,
    entityId,
    metadata: { section, name },
  });
}

export const usePlatformSettings = create<PlatformSettingsState>()(
  persist(
    (set, get) => ({
      draft: emptyPlatformDraft(),
      hydrated: false,

      settings: () => effectiveSettings(deliveryZones, get().draft),
      authored: () => !isPlatformDraftEmpty(get().draft),

      saveRegion: (code, input) => {
        const result = saveRegion(get().draft, code, input, Date.now());
        if (Object.keys(result.errors).length) return { errors: result.errors };
        set({ draft: result.draft });
        auditChange("region", code, "tax terms", regionName(code));
        return { errors: {} };
      },

      setRegionActive: (code, active) => {
        const result = setRegionActive(get().draft, code, active, Date.now());
        if (Object.keys(result.errors).length) return { errors: result.errors };
        set({ draft: result.draft });
        auditChange(
          "region",
          code,
          active ? "opened for trade" : "closed for trade",
          regionName(code),
        );
        return { errors: {} };
      },

      setDefaultCountry: (code) => {
        const result = setDefaultCountry(get().draft, code, Date.now());
        if (Object.keys(result.errors).length) return { errors: result.errors };
        set({ draft: result.draft });
        auditChange("platform", "platform", "default country", regionName(code));
        return { errors: {} };
      },

      saveZone: (zoneId, input) => {
        const result = saveZone(get().draft, deliveryZones, zoneId, input, Date.now());
        if (Object.keys(result.errors).length) return { errors: result.errors };
        set({ draft: result.draft });
        auditChange("delivery-zone", zoneId, "coverage and fares", zoneName(zoneId));
        return { errors: {} };
      },

      setZoneActive: (zoneId, active) => {
        const result = setZoneActive(get().draft, deliveryZones, zoneId, active, Date.now());
        if (Object.keys(result.errors).length) return { errors: result.errors };
        set({ draft: result.draft });
        auditChange(
          "delivery-zone",
          zoneId,
          active ? "opened" : "closed",
          zoneName(zoneId),
        );
        return { errors: {} };
      },

      /**
       * Back to the baseline.
       *
       * The draft is replaced with an empty one rather than each patch removed, for
       * the reason `stores/menu.resetVendor` drops a draft: an empty diff and no
       * diff have to fold to the same configuration, and this is the version that
       * cannot be wrong.
       */
      reset: () => set({ draft: emptyPlatformDraft() }),
      resetDemo: () => set({ draft: emptyPlatformDraft() }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-platform-settings",
      version: STORE_VERSION,
      partialize: (s) => ({ draft: s.draft }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

syncAcrossWindows("foodora-platform-settings", () => {
  void usePlatformSettings.persist.rehydrate();
});

// ---------------------------------------------------------------------------
// Reading the configuration from outside React
// ---------------------------------------------------------------------------

/**
 * The draft, for a caller that is not a component.
 *
 * `stores/orders` needs it to price a courier's ceiling and their earnings, and a
 * store cannot use a hook. Same shape as `stores/auth.currentUser` and
 * `sessionCan`, and the same reason: the value is read at the moment of the
 * mutation, which is the moment it has to be right.
 */
export function platformDraft(): PlatformSettingsDraft {
  return usePlatformSettings.getState().draft;
}

/**
 * Every zone as this device has it — **including the closed ones**, which carry
 * `deletedAt`.
 *
 * The lookup form, for dispatch and for pricing. A closed zone still has to resolve
 * for an order that was placed while it was open: `services/delivery.jobForOrder`
 * returns null for a zone it cannot find, and a null trip means no courier fares,
 * no route and no earnings for a delivery that really happened. The
 * customer-facing question — may a *new* order be placed here — is
 * `serviceableNetwork` below.
 */
export function platformZones(): DeliveryZone[] {
  return effectiveSettings(deliveryZones, platformDraft()).zones;
}

/** The zones a new order may be placed into. The closed ones are gone. */
export function serviceableNetwork(): DeliveryZone[] {
  return serviceableZones(deliveryZones, platformDraft());
}

/** The effective tax terms for a country, outside React. */
export function platformTax(countryCode: string | null | undefined): TaxTerms {
  return taxFor(platformDraft(), countryCode);
}

// ---------------------------------------------------------------------------
// Reading the configuration inside React
// ---------------------------------------------------------------------------

/**
 * The draft, rehydrated — one line at every surface that injects it into the seam.
 *
 * Six components load the delivery network and five price something, and every one
 * of them has to (a) ask this store to rehydrate, because the persist middleware is
 * `skipHydration` like every other store here, and (b) pass what it holds into the
 * service. Repeating both at eleven call sites is eleven chances to do one and
 * forget the other — which would show as a surface quietly still reading the seed.
 *
 * Returns the draft rather than the fold so the caller decides what to fold: the
 * checkout wants tax terms for one country, the picker wants the open zones, and
 * neither should build the other.
 */
export function usePlatformDraft(): PlatformSettingsDraft {
  const draft = usePlatformSettings((s) => s.draft);
  useEffect(() => {
    void usePlatformSettings.persist.rehydrate();
  }, []);
  return draft;
}

// ---------------------------------------------------------------------------
// Labels for the audit trail
// ---------------------------------------------------------------------------

/**
 * A country's or a zone's name, for a log line.
 *
 * Read from the baseline rather than the fold on purpose: the log records *what was
 * changed*, and the name of the record is the stable way to say which one. A zone
 * renamed in the same save would otherwise appear in the trail under its new name
 * with no entry ever mentioning the old one.
 */
function regionName(code: string): string {
  return (countries as Record<string, { name: string }>)[code]?.name ?? code;
}

function zoneName(zoneId: string): string {
  return deliveryZones.find((zone) => zone.id === zoneId)?.name ?? zoneId;
}
