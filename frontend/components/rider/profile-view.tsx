"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  BadgeCheck,
  Bike,
  Clock,
  FileCheck2,
  LogOut,
  MapPin,
  Star,
} from "lucide-react";
import type { DeliveryZone, RiderVehicle } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { useAuth } from "@/frontend/stores/auth";
import { useRider } from "@/frontend/stores/rider";
import { getDeliveryZones, updateRiderProfile } from "@/frontend/services/delivery";
import { VEHICLES } from "@/frontend/lib/delivery";
import { formatPrice, formatRating } from "@/frontend/lib/format";
import { Badge } from "@/frontend/components/ui/badge";
import { Input } from "@/frontend/components/ui/input";
import { cn } from "@/frontend/lib/utils";
import { useRiderApp } from "./rider-context";
import { RiderFeedback } from "./rider-feedback";

/**
 * RiderProfileView — `/delivery/profile` (Phase C18; spec: Delivery Partner
 * Registration, Verification).
 *
 * Three things belong to the rider here: the vehicle they ride (which changes
 * their ETAs, because speed is per vehicle), the zone they work (which changes
 * what they are paid, because fares are per zone) and their documents. So the
 * screen also shows the zone's fare card — a rider should be able to see the rule
 * that produced the number on their last trip, not just the number.
 */
export function RiderProfileView() {
  const t = useTranslations("delivery");
  const router = useRouter();
  const { rider, zone, setRider } = useRiderApp();
  const currency = zone.currency as CurrencyCode;

  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const setOnline = useRider((s) => s.setOnline);

  const [zones, setZones] = useState<DeliveryZone[]>([zone]);
  const [vehicle, setVehicle] = useState<RiderVehicle>(rider.vehicle);
  const [plate, setPlate] = useState(rider.plate ?? "");
  const [zoneId, setZoneId] = useState(rider.zoneId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getDeliveryZones().then((list) => {
      if (active && list.length > 0) setZones(list);
    });
    return () => {
      active = false;
    };
  }, []);

  // A bicycle has nothing to register, so switching to one drops the plate
  // rather than quietly keeping the motorbike's behind a disabled field.
  const nextPlate = vehicle === "bicycle" ? null : plate.trim() || null;
  const dirty =
    vehicle !== rider.vehicle || nextPlate !== rider.plate || zoneId !== rider.zoneId;

  function save() {
    setSaving(true);
    updateRiderProfile(rider, { vehicle, plate: nextPlate, zoneId }).then((res) => {
      setSaving(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      setRider(res.data);
      toast.success(t("profileSaved"));
    });
  }

  function handleSignOut() {
    // Leaving the app should not leave a ghost rider on shift in the pool.
    setOnline(false, null);
    signOut();
    toast.success(t("signedOut"));
    router.push("/");
  }

  const initials = rider.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-h1 text-ink">{t("profileTitle")}</h1>
        <p className="text-sm text-muted">{t("profileSubtitle")}</p>
      </div>

      {/* Who the rider is */}
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex items-center gap-4">
          <span className="inline-flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-primary text-lg font-bold text-white">
            {rider.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rider.photo} alt="" className="size-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-h3 text-ink">{rider.name}</p>
            <p className="truncate text-sm text-muted">{user?.email ?? rider.phone}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Star className="size-3.5 text-accent-500" aria-hidden />
              {formatRating(rider.rating)}
              <span className="font-normal text-muted">
                · {t("lifetimeTrips", { count: rider.trips })}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
          <div>
            <p className="text-lg font-extrabold text-ink">
              {Math.round(rider.acceptanceRate * 100)}%
            </p>
            <p className="text-xs text-muted">{t("statAcceptance")}</p>
          </div>
          <div>
            <p className="text-lg font-extrabold text-ink">
              {Math.round(rider.onTimeRate * 100)}%
            </p>
            <p className="text-xs text-muted">{t("statOnTime")}</p>
          </div>
          <div>
            <p className="text-lg font-extrabold text-ink">
              {new Date(rider.joinedAt).getFullYear()}
            </p>
            <p className="text-xs text-muted">{t("statSince")}</p>
          </div>
        </div>
      </section>

      {/* Vehicle + zone */}
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">{t("vehicleTitle")}</h2>
        <p className="mt-1 text-xs text-muted">{t("vehicleHint")}</p>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {VEHICLES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setVehicle(option)}
              aria-pressed={vehicle === option}
              className={cn(
                "flex flex-col items-center gap-1 rounded-field border py-2.5 text-xs font-semibold transition-colors",
                vehicle === option
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-line text-body hover:bg-surface-muted",
              )}
            >
              <Bike className="size-4" aria-hidden />
              {t(`vehicle.${option}`)}
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-semibold text-ink">{t("plateLabel")}</span>
          <Input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder={vehicle === "bicycle" ? t("plateNone") : "DHA-M-1284"}
            disabled={saving || vehicle === "bicycle"}
            className="mt-1.5"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-semibold text-ink">{t("zoneLabel")}</span>
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            disabled={saving}
            className="mt-1.5 h-11 w-full rounded-field border border-line bg-surface px-3.5 text-sm text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {zones.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="mt-4 h-11 w-full rounded-pill bg-primary text-sm font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
        >
          {saving ? t("working") : t("saveChanges")}
        </button>
      </section>

      {/* What customers said (Phase C22) */}
      <RiderFeedback riderId={rider.id} />

      {/* What the zone pays */}
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <MapPin className="size-4 text-primary" aria-hidden />
          {t("zoneCardTitle", { zone: zone.name })}
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label={t("fareBase")} value={formatPrice(zone.baseFare, currency)} />
          <Row label={t("farePerKm")} value={formatPrice(zone.perKm, currency)} />
          <Row
            label={t("farePeak")}
            value={t("farePeakValue", {
              multiplier: zone.peakMultiplier.toFixed(2),
              hours: zone.peakHours.map((h) => `${String(h).padStart(2, "0")}:00`).join(", "),
            })}
          />
          <Row label={t("fareBatch")} value={formatPrice(zone.batchBonus, currency)} />
          <Row label={t("fareCashLimit")} value={formatPrice(zone.cashLimit, currency)} />
        </dl>
        <p className="mt-3 text-xs text-muted">{t("zoneAreas", { areas: zone.areas.join(" · ") })}</p>
      </section>

      {/* Documents */}
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <FileCheck2 className="size-4 text-primary" aria-hidden />
          {t("documentsTitle")}
        </h2>
        <ul className="mt-3 divide-y divide-line">
          {rider.documents.map((doc) => (
            <li key={doc.kind} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">
                  {t(`document.${doc.kind}`)}
                </span>
                {doc.expiresAt && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Clock className="size-3" aria-hidden />
                    {t("expires", {
                      date: new Date(doc.expiresAt).toLocaleDateString(undefined, {
                        month: "short",
                        year: "numeric",
                      }),
                    })}
                  </span>
                )}
              </span>
              <Badge
                tone={
                  doc.status === "verified"
                    ? "fresh"
                    : doc.status === "pending"
                      ? "accent"
                      : "danger"
                }
              >
                {doc.status === "verified" && <BadgeCheck className="size-3" aria-hidden />}
                {t(`documentStatus.${doc.status}`)}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{t("documentsNote")}</p>
      </section>

      <button
        type="button"
        onClick={handleSignOut}
        className="flex w-full items-center justify-center gap-2 rounded-pill border border-line py-3 text-sm font-semibold text-danger transition-colors hover:bg-danger/5"
      >
        <LogOut className="size-4 rtl:rotate-180" aria-hidden />
        {t("signOut")}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-body">{label}</dt>
      <dd className="text-end font-semibold text-ink">{value}</dd>
    </div>
  );
}
