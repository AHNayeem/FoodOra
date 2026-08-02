"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, ExternalLink, Printer, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { QrMenuConfig, QrTarget, TableZone } from "@/types";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { getQrMenuConfig, getQrTargets } from "@/services/qr";
import { qrFileSlug } from "@/lib/qr";
import { QrCode, qrPngDataUrl, qrSvgMarkup } from "@/components/qr/qr-code";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { downloadBlob, printQrSheet, targetUrl } from "./qr-print";

const ZONES: readonly TableZone[] = ["indoor", "outdoor", "rooftop", "private"];

/**
 * QrStudio — the vendor side of the QR Menu (Phase C12).
 *
 * A code is only useful once it is on a table, so this page is built around
 * getting them onto paper: preview, copy, download, and a print sheet of table
 * tents. Codes are generated in the browser from the studio's own origin, which
 * means they are correct on localhost, on a preview deploy and in production
 * without anything being configured.
 */
export function QrStudio() {
  const { vendor } = useDashboard();
  const t = useTranslations("qr");

  const [targets, setTargets] = useState<QrTarget[]>([]);
  const [config, setConfig] = useState<QrMenuConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [zone, setZone] = useState<TableZone | "all">("all");
  const [printing, setPrinting] = useState(false);

  /**
   * Codes encode the host the studio is being viewed on, so they work on
   * localhost, a preview deploy and production with nothing configured. Safe to
   * read during render: the dashboard shell gates on client auth, so this
   * component never renders on the server.
   */
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );

  // The shell resolves the vendor once and never swaps it, so `loading` only
  // ever goes true → false; no synchronous reset is needed on re-run.
  useEffect(() => {
    let active = true;
    Promise.all([getQrTargets(vendor), getQrMenuConfig(vendor.id)])
      .then(([list, cfg]) => {
        if (!active) return;
        setTargets(list);
        setConfig(cfg);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [vendor]);

  const storefront = targets.find((target) => target.kind === "storefront") ?? null;
  const tables = useMemo(
    () =>
      targets.filter(
        (target) => target.kind === "table" && (zone === "all" || target.zone === zone),
      ),
    [targets, zone],
  );

  const zonesInUse = useMemo(
    () =>
      ZONES.filter((z) => targets.some((target) => target.zone === z)),
    [targets],
  );

  async function handlePrint(list: QrTarget[]) {
    if (list.length === 0 || !origin) return;
    setPrinting(true);
    const opened = await printQrSheet(list, origin, vendor.name, {
      documentTitle: t("studio.printTitle", { name: vendor.name }),
      scanTitle: t("studio.posterScan"),
      scanHint: t("studio.posterHint"),
    });
    setPrinting(false);
    if (!opened) toast.error(t("studio.popupBlocked"));
  }

  return (
    <div className="p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t("studio.title")}</h1>
          <p className="mt-1 text-body">{t("studio.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => handlePrint(targets)}
          disabled={printing || targets.length === 0 || !origin}
          className="inline-flex h-11 items-center gap-2 rounded-pill bg-primary px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:pointer-events-none disabled:opacity-60"
        >
          <Printer className="size-4.5" aria-hidden />
          {t("studio.printAll")}
        </button>
      </header>

      {config && <GuestCapabilities config={config} />}

      {loading ? (
        <div className="grid place-items-center py-24">
          <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
        </div>
      ) : (
        <>
          {/* Venue-wide code */}
          {storefront && origin && (
            <section className="mt-6">
              <h2 className="text-h3 text-ink">{t("studio.storefront")}</h2>
              <p className="mt-1 text-sm text-body">{t("studio.storefrontHint")}</p>
              <div className="mt-3 flex flex-wrap items-center gap-5 rounded-panel border border-line bg-surface p-5">
                <QrCode
                  value={targetUrl(origin, storefront)}
                  size={148}
                  label={t("studio.codeFor", { label: vendor.name })}
                  className="border border-line p-2"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold text-ink">
                    <Store className="size-4.5 text-primary" aria-hidden />
                    {vendor.name}
                  </p>
                  <p className="mt-1 break-all text-xs text-muted">
                    {targetUrl(origin, storefront)}
                  </p>
                  <TargetActions
                    target={storefront}
                    origin={origin}
                    vendorSlug={vendor.slug}
                    vendorName={vendor.name}
                    onPrint={() => handlePrint([storefront])}
                  />
                </div>
              </div>
            </section>
          )}

          {/* Table codes */}
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-h3 text-ink">{t("studio.tables")}</h2>
              {zonesInUse.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <ZoneChip active={zone === "all"} onClick={() => setZone("all")}>
                    {t("studio.zone.all")}
                  </ZoneChip>
                  {zonesInUse.map((z) => (
                    <ZoneChip key={z} active={zone === z} onClick={() => setZone(z)}>
                      {t(`studio.zone.${z}`)}
                    </ZoneChip>
                  ))}
                </div>
              )}
            </div>

            {tables.length === 0 ? (
              <p className="mt-4 rounded-panel border border-dashed border-line bg-surface p-8 text-center text-body">
                {t("studio.noTables")}
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {tables.map((target) => (
                  <article
                    key={target.id}
                    className="flex flex-col items-center rounded-panel border border-line bg-surface p-5 text-center"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-extrabold text-ink">
                        {target.label}
                      </span>
                      {target.zone && (
                        <Badge>{t(`studio.zone.${target.zone}`)}</Badge>
                      )}
                    </div>
                    {target.seats != null && (
                      <p className="mt-0.5 text-xs text-muted">
                        {t("studio.seats", { count: target.seats })}
                      </p>
                    )}
                    {origin && (
                      <QrCode
                        value={targetUrl(origin, target)}
                        size={156}
                        label={t("studio.codeFor", { label: target.label })}
                        className="mt-3 border border-line p-2"
                      />
                    )}
                    <TargetActions
                      target={target}
                      origin={origin}
                      vendorSlug={vendor.slug}
                      vendorName={vendor.name}
                      onPrint={() => handlePrint([target])}
                    />
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Read-only summary of what a scanning guest can do at this venue. */
function GuestCapabilities({ config }: { config: QrMenuConfig }) {
  const t = useTranslations("qr");
  const rows: Array<[string, boolean | string]> = [
    [t("studio.setting.ordering"), config.ordering],
    [t("studio.setting.waiterCall"), config.waiterCall],
    [t("studio.setting.billRequest"), config.billRequest],
    [
      t("studio.setting.serviceCharge"),
      config.serviceChargeRate > 0
        ? `${Math.round(config.serviceChargeRate * 100)}%`
        : false,
    ],
  ];

  return (
    <section className="mt-6 rounded-panel border border-line bg-surface p-5">
      <h2 className="text-h3 text-ink">{t("studio.settingsTitle")}</h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-field bg-surface-muted px-3.5 py-2.5"
          >
            <dt className="text-sm text-body">{label}</dt>
            <dd>
              {typeof value === "string" ? (
                <Badge tone="primary">{value}</Badge>
              ) : (
                <Badge tone={value ? "fresh" : "neutral"}>
                  {value ? t("studio.setting.on") : t("studio.setting.off")}
                </Badge>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">{t("studio.settingsHint")}</p>
    </section>
  );
}

function ZoneChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-line text-body hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Copy / download / print / open row shared by the venue and table cards. */
function TargetActions({
  target,
  origin,
  vendorSlug,
  vendorName,
  onPrint,
}: {
  target: QrTarget;
  origin: string;
  vendorSlug: string;
  vendorName: string;
  onPrint: () => void;
}) {
  const t = useTranslations("qr");
  const [copied, setCopied] = useState(false);

  const url = origin ? targetUrl(origin, target) : "";
  const stem = qrFileSlug(
    vendorSlug,
    target.kind === "storefront" ? "venue" : target.label,
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("studio.copied"));
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("studio.copyFailed"));
    }
  }

  async function handleSvg() {
    const svg = await qrSvgMarkup(url, 512);
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${stem}.svg`);
    toast.success(t("studio.downloaded", { name: `${stem}.svg` }));
  }

  async function handlePng() {
    downloadBlob(await qrPngDataUrl(url, 1024), `${stem}.png`);
    toast.success(t("studio.downloaded", { name: `${stem}.png` }));
  }

  const action =
    "inline-flex h-9 items-center gap-1.5 rounded-pill border border-line px-3 text-xs font-semibold text-body transition-colors hover:bg-surface-muted disabled:opacity-50";

  return (
    <div className="mt-3 flex flex-wrap justify-center gap-1.5">
      <button type="button" onClick={handleCopy} disabled={!url} className={action}>
        {copied ? (
          <Check className="size-3.5 text-fresh-600" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        {t("studio.copyLink")}
      </button>
      <button type="button" onClick={handleSvg} disabled={!url} className={action}>
        <Download className="size-3.5" aria-hidden />
        SVG
      </button>
      <button type="button" onClick={handlePng} disabled={!url} className={action}>
        <Download className="size-3.5" aria-hidden />
        PNG
      </button>
      <button type="button" onClick={onPrint} disabled={!url} className={action}>
        <Printer className="size-3.5" aria-hidden />
        {t("studio.printOne")}
      </button>
      <a
        href={target.path}
        target="_blank"
        rel="noreferrer"
        className={action}
        title={vendorName}
      >
        <ExternalLink className="size-3.5 rtl:-scale-x-100" aria-hidden />
        {t("studio.openMenu")}
      </a>
    </div>
  );
}
