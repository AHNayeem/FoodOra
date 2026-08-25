"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, MapPin, TriangleAlert } from "lucide-react";
import type { CartVendor } from "@/types";
import { useLocation } from "@/stores/location";
import { getDeliveryZones } from "@/services/delivery";
import { checkVendorDelivery } from "@/lib/serviceability";
import { LocationPicker } from "./location-picker";
import { cn } from "@/lib/utils";

/**
 * ServiceabilityNotice — "does this restaurant deliver to you?", asked on the
 * restaurant's own page (Phase 17, G37).
 *
 * Before the basket, deliberately. The check itself could equally be run at
 * checkout — and is — but a customer who has spent five minutes choosing a meal
 * and is then told nobody can bring it has been wasted, and the information was
 * available the whole time.
 *
 * Three outcomes, and only one of them is a refusal. No location chosen is a
 * *prompt*, not a warning: nothing is wrong, the customer simply has not said
 * where they are. `unknown` — a snapshot too old to carry the restaurant's
 * position — renders nothing at all, because a banner that says "we could not
 * check" is noise on a page nobody asked a question on.
 */
export function ServiceabilityNotice({
  vendor,
  className,
}: {
  vendor: CartVendor;
  className?: string;
}) {
  const t = useTranslations("location");
  const zones = useLocation((s) => s.zones);
  const seedZones = useLocation((s) => s.seedZones);
  const area = useLocation((s) => s.area);
  const hydrated = useLocation((s) => s.hydrated);

  useEffect(() => {
    void useLocation.persist.rehydrate();
    if (zones.length === 0) getDeliveryZones().then(seedZones);
  }, [zones.length, seedZones]);

  // The zones are the question's other half: without them every answer would be
  // "outside the network", which is the one wrong thing to say while loading.
  if (!hydrated || zones.length === 0) return null;

  const check = checkVendorDelivery(zones, vendor, area);
  if (check.reason === "unknown") return null;

  if (check.serviceable) {
    return (
      <p
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-field bg-fresh/10 px-4 py-3 text-sm text-body",
          className,
        )}
      >
        <CheckCircle2 className="size-4 shrink-0 text-fresh-600" aria-hidden />
        {t("delivers", { area: area ?? "", zone: check.zone?.name ?? "" })}
      </p>
    );
  }

  const prompt = check.reason === "noLocation";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-field px-4 py-3 text-sm",
        prompt ? "bg-surface-muted text-body" : "bg-danger/5 text-body",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {prompt ? (
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        ) : (
          <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden />
        )}
        <span className="min-w-0">
          {check.reason === "tooFar"
            ? t("reason.tooFar", { vendor: vendor.name, area: area ?? "" })
            : check.reason === "outsideNetwork"
              ? t("reason.outsideNetwork", { area: area ?? "" })
              : t("reason.noLocation")}
        </span>
      </span>
      <LocationPicker className="shrink-0 border border-line" />
    </div>
  );
}
