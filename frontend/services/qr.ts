import { qrMenuConfigByVendor, tablesByVendor } from "@/frontend/lib/mock";
import { qrMenuPath, DEFAULT_SERVICE_CHARGE_RATE } from "@/frontend/lib/qr";
import type {
  CartLine,
  DineInRound,
  QrMenuConfig,
  QrTarget,
  RestaurantTable,
  ServiceRequest,
  ServiceRequestKind,
  Vendor,
} from "@/frontend/types";
import { mockDelay, ok, type Result } from "./http";

/**
 * qr.ts — read/write seam for the QR Menu (Phase C12).
 *
 * Two callers, one seam: the guest page (`/m/[slug]`) resolves the venue's
 * config and the scanned table, and the vendor studio (`/dashboard/qr`) lists
 * the printable targets. Writes — sending a round to the kitchen, raising a
 * service request — are simulated exactly like `services/pos.completeSale`:
 * validate, fabricate the record, hand it back for the client store to commit.
 */

/**
 * Settings for a venue that hasn't opted into a bespoke QR programme. Ordering
 * is on by default (that is the point of the feature); the greeting is left to
 * the UI's translated fallback.
 */
function defaultQrConfig(vendorId: string): QrMenuConfig {
  return {
    id: `qrc_default_${vendorId}`,
    vendorId,
    welcomeMessage: "",
    ordering: true,
    waiterCall: true,
    billRequest: true,
    serviceChargeRate: DEFAULT_SERVICE_CHARGE_RATE,
    askGuestName: false,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
  };
}

/** The venue's QR menu settings, always resolving to something usable. */
export async function getQrMenuConfig(vendorId: string): Promise<QrMenuConfig> {
  return mockDelay(qrMenuConfigByVendor[vendorId] ?? defaultQrConfig(vendorId), 150);
}

/**
 * Resolve the scanned table. Accepts the table id a printed code carries, and
 * also a bare label ("T3") so a hand-typed or shortened link still works.
 * Returns null for a venue-wide code or an unknown table — the guest simply
 * gets the counter experience instead of a dead end.
 */
export async function getQrTable(
  vendorId: string,
  tableParam: string | null,
): Promise<RestaurantTable | null> {
  if (!tableParam) return mockDelay(null, 100);
  const needle = tableParam.trim().toLowerCase();
  const table =
    (tablesByVendor[vendorId] ?? []).find(
      (t) =>
        !t.deletedAt &&
        (t.id.toLowerCase() === needle || t.label.toLowerCase() === needle),
    ) ?? null;
  return mockDelay(table, 100);
}

/** Every printable code for a venue: the storefront code, then each table. */
export async function getQrTargets(vendor: Vendor): Promise<QrTarget[]> {
  const storefront: QrTarget = {
    id: `qrt_${vendor.id}_storefront`,
    kind: "storefront",
    label: vendor.name,
    zone: null,
    seats: null,
    path: qrMenuPath(vendor.slug),
  };

  const tables: QrTarget[] = (tablesByVendor[vendor.id] ?? [])
    .filter((t) => !t.deletedAt)
    .map((t) => ({
      id: `qrt_${t.id}`,
      kind: "table" as const,
      label: t.label,
      zone: t.zone,
      seats: t.seats,
      path: qrMenuPath(vendor.slug, t.id),
    }));

  return mockDelay([storefront, ...tables], 250);
}

export interface SendRoundInput {
  vendorId: string;
  tableId: string | null;
  guestName: string;
  lines: CartLine[];
  note: string;
  /** 1-based position of this round within the sitting. */
  roundNumber: number;
}

/**
 * Fire a round at the kitchen. Error strings are `qr`-scoped i18n keys the
 * guest surfaces via a toast, matching the POS convention.
 */
export async function sendRound(input: SendRoundInput): Promise<Result<DineInRound>> {
  if (input.lines.length === 0) {
    return { data: null, error: "errors.emptyRound" };
  }

  const nowMs = Date.now();
  const round: DineInRound = {
    id: `rnd_${nowMs.toString(36)}`,
    roundNumber: input.roundNumber,
    lines: input.lines,
    note: input.note,
    sentAt: new Date(nowMs).toISOString(),
  };

  return mockDelay(ok(round), 600);
}

export interface ServiceRequestInput {
  vendorId: string;
  tableId: string | null;
  kind: ServiceRequestKind;
}

/**
 * Raise a hand from the table. A venue-wide code has no table to send staff to,
 * so the request is refused rather than silently dropped.
 */
export async function requestService(
  input: ServiceRequestInput,
): Promise<Result<ServiceRequest>> {
  if (!input.tableId) {
    return { data: null, error: "errors.noTable" };
  }

  const nowMs = Date.now();
  const request: ServiceRequest = {
    id: `svc_${nowMs.toString(36)}`,
    kind: input.kind,
    requestedAt: new Date(nowMs).toISOString(),
  };

  return mockDelay(ok(request), 400);
}
