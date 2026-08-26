import type {
  DeliveryZone,
  PlatformSettings,
  PlatformSettingsDraft,
  TaxTerms,
} from "@/types";
import { deliveryZones } from "@/lib/mock";
import {
  EMPTY_PLATFORM_DRAFT,
  effectiveSettings,
  serviceableZones,
  taxFor,
} from "@/lib/platform-settings";
import { mockDelay, ok, type Result } from "./http";

/**
 * platform-settings.ts — read + write API for the platform's own configuration
 * (Phase 19, G30).
 *
 * The seam the rest of the app talks to, on the same contract as every other
 * service here: async, `Result<T>` on the way back, error strings are i18n keys the
 * UI translates. What it hands out is the **fold** — `config/regions.ts` and
 * `lib/mock/delivery-zones.ts` with the operator's edits applied — so a caller
 * never sees the diff and never has to apply it.
 *
 * The draft is passed *in* rather than read from the store, which is the rule the
 * whole `services/` layer keeps (`getFleet` takes `admitted`, `getRiderDay` takes a
 * `RiderContext`): a service cannot reach into a client store, because in Phase E
 * it is running on a server that has the rows in its own database. When that
 * happens the parameter is simply dropped and every signature here stays put.
 *
 * `saveSettings` exists to be the endpoint a real API replaces. It echoes the
 * merged draft the way `services/settings.updateSettings` does, so the caller
 * commits the server's answer rather than assuming its optimistic edit stuck;
 * `stores/platform-settings` is what actually persists it on this device.
 */

/**
 * The configuration as it stands.
 *
 * The zone seed is not a parameter: `lib/mock/delivery-zones` is the baseline by
 * definition, and a caller that could substitute one would be a second
 * configuration system — the thing G30 exists to avoid.
 */
export async function getPlatformSettings(
  draft: PlatformSettingsDraft = EMPTY_PLATFORM_DRAFT,
): Promise<PlatformSettings> {
  return mockDelay(effectiveSettings(deliveryZones, draft), 200);
}

/**
 * Synchronous read, for a caller that already holds the draft and is rendering.
 *
 * Same fold, no delay. `nextStopOf` and `jobForOrder` set this precedent: a
 * projection of a record the caller already has is not a fetch, and pretending it
 * is one only makes the screen flash. Phase E turns this into a selector over the
 * cached query and the callers stay put.
 */
export function platformSettingsOf(
  draft: PlatformSettingsDraft = EMPTY_PLATFORM_DRAFT,
): PlatformSettings {
  return effectiveSettings(deliveryZones, draft);
}

/**
 * The network a *new* order may be placed into — the delivery zones minus the
 * ones no courier works.
 *
 * The customer-facing question, and the reason it is here rather than left to each
 * caller: `services/delivery.getDeliveryZones` answers the same question for the
 * rider app and the application forms, and two implementations of "which zones
 * count" is how the storefront came to offer areas dispatch could not serve in the
 * first place (G37).
 */
export async function getServiceableZones(
  draft: PlatformSettingsDraft = EMPTY_PLATFORM_DRAFT,
): Promise<DeliveryZone[]> {
  return mockDelay(serviceableZones(deliveryZones, draft), 150);
}

/**
 * The tax terms an order in this country is priced with.
 *
 * Synchronous for the reason `platformSettingsOf` is: the checkout summary
 * recomputes on every keystroke and a promise per keystroke would make the total
 * arrive after the tip. This is the value the five pricing functions in `lib/`
 * take as their `tax` override.
 */
export function taxTermsFor(
  countryCode: string | null | undefined,
  draft: PlatformSettingsDraft = EMPTY_PLATFORM_DRAFT,
): TaxTerms {
  return taxFor(draft, countryCode);
}

/**
 * Persist a configuration change.
 *
 * Simulated: echoes the draft a real endpoint would return. The validation that
 * decides whether a change is acceptable lives in `lib/platform-settings` and runs
 * in the store before this is ever called — the same arrangement
 * `stores/vendor-settings` has, and for the same reason: a refusal has to be
 * available to the form synchronously or the form cannot show it against a field.
 */
export async function savePlatformSettings(
  next: PlatformSettingsDraft,
): Promise<Result<PlatformSettingsDraft>> {
  await mockDelay(null, 300);
  return ok(next);
}
