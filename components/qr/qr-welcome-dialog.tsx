"use client";

import { useState } from "react";
import Image from "next/image";
import { QrCode, Utensils } from "lucide-react";
import { useTranslations } from "next-intl";
import type { QrMenuConfig, Vendor } from "@/types";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

/**
 * QrWelcomeDialog — the first thing a guest sees after scanning (Phase C12).
 *
 * It exists to answer three questions in one glance: which venue is this, which
 * table am I at, and what can I do here. Venues that ask for a name collect it
 * once, so later rounds and service calls reach the right table by a human
 * label rather than a table id.
 */
export function QrWelcomeDialog({
  vendor,
  config,
  tableLabel,
  open,
  onStart,
}: {
  vendor: Vendor;
  config: QrMenuConfig;
  tableLabel: string | null;
  open: boolean;
  onStart: (guestName: string) => void;
}) {
  const t = useTranslations("qr");
  const [name, setName] = useState("");

  const titleId = "qr-welcome-title";

  return (
    // No onClose: the sheet is the entry point, not a dismissible overlay.
    <Modal open={open} onClose={() => onStart(name)} labelledBy={titleId}>
      <div className="relative h-28 bg-primary">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, rgba(255,255,255,.5), transparent 50%), radial-gradient(circle at 85% 80%, rgba(255,176,32,.6), transparent 50%)",
          }}
          aria-hidden
        />
        <span className="absolute -bottom-8 start-5 inline-flex size-16 items-center justify-center overflow-hidden rounded-field border-4 border-surface bg-surface">
          <Image
            src={vendor.logo}
            alt=""
            width={64}
            height={64}
            className="size-full object-cover"
          />
        </span>
        {tableLabel && (
          <span className="absolute end-4 top-4 inline-flex items-center gap-1.5 rounded-pill bg-white/20 px-3 py-1.5 text-sm font-bold text-white backdrop-blur">
            <QrCode className="size-4" aria-hidden />
            {t("tableBadge", { label: tableLabel })}
          </span>
        )}
      </div>

      <div className="px-5 pb-5 pt-11">
        <h2 id={titleId} className="text-h3 text-ink">
          {t("welcomeTitle", { name: vendor.name })}
        </h2>
        <p className="mt-1.5 text-sm text-body">
          {config.welcomeMessage ||
            (config.ordering ? t("welcomeOrdering") : t("welcomeBrowsing"))}
        </p>

        {config.askGuestName && config.ordering && (
          <label className="mt-5 block">
            <span className="text-sm font-semibold text-ink">{t("guestNameLabel")}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("guestNamePlaceholder")}
              autoComplete="given-name"
              className="mt-1.5"
            />
          </label>
        )}

        <button
          type="button"
          onClick={() => onStart(name)}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-primary px-5 font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 active:scale-[0.98]"
        >
          <Utensils className="size-4.5" aria-hidden />
          {config.ordering ? t("startOrdering") : t("startBrowsing")}
        </button>
      </div>
    </Modal>
  );
}
