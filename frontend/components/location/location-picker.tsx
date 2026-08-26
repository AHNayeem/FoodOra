"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import type { SavedAddress } from "@/types";
import { useAddresses } from "@/stores/addresses";
import { useAuth } from "@/stores/auth";
import { useLocation } from "@/stores/location";
import { getAddressBook } from "@/services/account";
import { usePlatformDraft } from "@/stores/platform-settings";
import { getDeliveryZones } from "@/services/delivery";
import { checkArea, servedAreas } from "@/lib/serviceability";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * LocationPicker — where the customer says they are (Phase 17, G37).
 *
 * The platform has always known which areas it covers: `lib/mock/delivery-zones`
 * is what dispatch picks couriers from and what prices their trips. Nothing on
 * the customer's side ever asked. This is the ask, and it is deliberately the
 * *same* list — a storefront that offered an area no rider works would be making
 * a promise the delivery network cannot keep.
 *
 * Two ways to answer, because a signed-in customer has already answered once: the
 * addresses they have saved, and the areas the network covers. A typed area that
 * matches nothing is answered honestly rather than accepted — "we are not there
 * yet" is a real state, and it is the state the whole check exists to detect.
 */
export function LocationPicker({ className }: { className?: string }) {
  const t = useTranslations("location");
  const [open, setOpen] = useState(false);

  const area = useLocation((s) => s.area);
  const label = useLocation((s) => s.label);
  const hydrated = useLocation((s) => s.hydrated);
  const zones = useLocation((s) => s.zones);
  const seedZones = useLocation((s) => s.seedZones);

  /**
   * The network is reference data and is never persisted — see the store. What it
   * *is* now is the platform's own configuration: `platform` is the operator's
   * draft (Phase 19, G30), so an area an operator has taken off the network is
   * gone from this list, and a zone whose areas they widened offers the new ones.
   */
  const platform = usePlatformDraft();
  useEffect(() => {
    void useLocation.persist.rehydrate();
    if (zones.length === 0) getDeliveryZones(platform).then(seedZones);
  }, [zones.length, seedZones, platform]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex max-w-[13rem] items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted",
          className,
        )}
      >
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">
          {/* Before hydration the server's answer is the neutral one, so SSR and
              the first client render agree — the contract every store here follows. */}
          {hydrated && area ? (label ?? area) : t("setLocation")}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted" aria-hidden />
      </button>

      <LocationDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function LocationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("location");
  const [query, setQuery] = useState("");

  const zones = useLocation((s) => s.zones);
  const area = useLocation((s) => s.area);
  const setArea = useLocation((s) => s.setArea);
  const setFromAddress = useLocation((s) => s.setFromAddress);

  const user = useAuth((s) => s.user);
  const addresses = useAddresses((s) => s.addresses);
  const addrHydrated = useAddresses((s) => s.hydrated);
  const addrSeeded = useAddresses((s) => s.seeded);
  const seedAddrs = useAddresses((s) => s.seed);

  useEffect(() => {
    if (!open) return;
    void useAddresses.persist.rehydrate();
    void useAuth.persist.rehydrate();
  }, [open]);

  useEffect(() => {
    if (open && addrHydrated && !addrSeeded) getAddressBook().then(seedAddrs);
  }, [open, addrHydrated, addrSeeded, seedAddrs]);

  const options = useMemo(() => servedAreas(zones), [zones]);
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? options.filter((o) => o.area.toLowerCase().includes(needle))
    : options;

  /**
   * What a typed query that matches nothing means.
   *
   * Only asked once there is something to be outside *of* — with no zones loaded
   * the honest answer is "still loading", not "we do not deliver there".
   */
  const missed =
    needle.length > 1 && zones.length > 0 && filtered.length === 0
      ? checkArea(zones, query)
      : null;

  function choose(next: string) {
    setArea(next);
    onClose();
  }

  function chooseAddress(address: SavedAddress) {
    setFromAddress(address);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="location-title" className="sm:max-w-md">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="location-title" className="text-h3 text-ink">
            {t("title")}
          </h2>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="-me-1 inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-muted hover:bg-surface-muted hover:text-ink"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="px-5 py-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="ps-10"
          />
        </div>

        {user && addresses.length > 0 && !needle && (
          <section className="mt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              {t("savedAddresses")}
            </h3>
            <ul className="space-y-1.5">
              {addresses.map((address) => (
                <li key={address.id}>
                  <AreaRow
                    title={address.label}
                    subtitle={`${address.line1} · ${address.area}`}
                    selected={area === address.area}
                    onSelect={() => chooseAddress(address)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            {t("servedAreas")}
          </h3>
          {missed ? (
            <p className="rounded-field bg-danger/5 p-3 text-sm text-body">
              {t("reason.outsideNetwork", { area: query.trim() })}
            </p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {filtered.map(({ area: name, zone }) => (
                <li key={`${zone.id}-${name}`}>
                  <AreaRow
                    title={name}
                    subtitle={zone.name}
                    selected={area === name}
                    onSelect={() => choose(name)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

function AreaRow({
  title,
  subtitle,
  selected,
  onSelect,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-field border p-3 text-start transition-colors",
        selected ? "border-primary bg-primary/5" : "border-line hover:bg-surface-muted",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        <span className="block truncate text-xs text-muted">{subtitle}</span>
      </span>
      {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
    </button>
  );
}
