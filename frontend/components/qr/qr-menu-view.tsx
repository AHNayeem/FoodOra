"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BellRing, ExternalLink, ReceiptText, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  CartLine,
  CartVendor,
  QrMenuConfig,
  RestaurantTable,
  Vendor,
} from "@/types";
import type { CurrencyCode } from "@/config/regions";
import type { MenuSectionWithItems } from "@/services/catalog";
import { useDineIn } from "@/stores/dine-in";
import { cartCount } from "@/lib/cart";
import { usePlatformDraft } from "@/stores/platform-settings";
import { taxTermsFor } from "@/services/platform-settings";
import { computeQrTotals, roundsLines, roundStatus, sessionKey } from "@/lib/qr";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LocaleSwitcher } from "@/components/ui/locale-switcher";
import { QrItemRow } from "./qr-item-row";
import { QrWelcomeDialog } from "./qr-welcome-dialog";
import { QrTicketPanel } from "./qr-ticket-panel";
import { QrBillPanel } from "./qr-bill-panel";
import { QrServiceSheet } from "./qr-service-sheet";

/**
 * QrMenuView — the whole scanned-table experience (Phase C12).
 *
 * Deliberately not the marketing menu with a different header: a guest at a
 * table has one thumb, a dim room and no patience for chrome. So this is a
 * single narrow column, a sticky search, and one bottom bar that always shows
 * the two things that matter — what this round costs and how to get a human.
 *
 * All state is client-side and per-device (`stores/dine-in`), which is honest
 * for a prototype: the sitting survives a refresh but not a second phone. Phase
 * E turns the store into a shared table session behind the same components.
 */
export function QrMenuView({
  vendor,
  cartVendor,
  menu,
  config,
  table,
}: {
  vendor: Vendor;
  cartVendor: CartVendor;
  menu: MenuSectionWithItems[];
  config: QrMenuConfig;
  table: RestaurantTable | null;
}) {
  const t = useTranslations("qr");
  const currency = vendor.currency as CurrencyCode;

  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [serviceOpen, setServiceOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

  const hydrated = useDineIn((s) => s.hydrated);
  const key = useDineIn((s) => s.key);
  const started = useDineIn((s) => s.started);
  const lines = useDineIn((s) => s.lines);
  const rounds = useDineIn((s) => s.rounds);
  const requests = useDineIn((s) => s.requests);
  const isTicketOpen = useDineIn((s) => s.isTicketOpen);
  const openSession = useDineIn((s) => s.openSession);
  const start = useDineIn((s) => s.start);
  const add = useDineIn((s) => s.add);
  const openTicket = useDineIn((s) => s.openTicket);
  const closeTicket = useDineIn((s) => s.closeTicket);

  useEffect(() => {
    useDineIn.persist.rehydrate();
  }, []);

  // Attach to the scanned table once storage is back. A different table (or a
  // different venue) starts a clean sitting; the same one resumes its bill.
  useEffect(() => {
    if (!hydrated) return;
    openSession(cartVendor, table?.id ?? null, table?.label ?? null);
  }, [hydrated, cartVendor, table, openSession]);

  // Round status and service acknowledgement are time-derived (C9's pattern),
  // so the screen only needs a clock while there is something in flight.
  const inFlight = rounds.length > 0 || requests.length > 0;
  useEffect(() => {
    if (!inFlight) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [inFlight]);

  const q = query.trim().toLowerCase();
  const sections = useMemo(() => {
    if (!q) return menu;
    return menu
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [menu, q]);

  /**
   * Until `openSession` has run, the persisted store may still hold the
   * previous table's sitting — gate on identity so no one is ever shown a bill
   * that isn't theirs, not even for one frame.
   */
  const attached = hydrated && key === sessionKey(vendor.id, table?.id ?? null);
  const count = attached ? cartCount(lines) : 0;
  const showWelcome = attached && !started;

  // The bill is taxed at the rate the platform is configured with (Phase 19,
  // G30), which is the same rate the same guest's delivery order would carry.
  const tax = taxTermsFor(vendor.location.countryCode, usePlatformDraft());

  const roundPricing = computeQrTotals({
    lines,
    currency: vendor.currency,
    countryCode: vendor.location.countryCode,
    serviceChargeRate: config.serviceChargeRate,
    tax,
  });
  const billTotal = attached
    ? computeQrTotals({
        lines: roundsLines(rounds),
        currency: vendor.currency,
        countryCode: vendor.location.countryCode,
        serviceChargeRate: config.serviceChargeRate,
        tax,
      }).total
    : 0;

  const hasService = config.waiterCall || config.billRequest;
  const latestRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

  function handleAdd(line: CartLine) {
    add(line);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-alt">
      {/* Venue bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <span className="relative inline-flex size-10 shrink-0 overflow-hidden rounded-field bg-surface-muted">
            <Image src={vendor.logo} alt="" fill sizes="40px" className="object-cover" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold tracking-tight text-ink">
              {vendor.name}
            </p>
            <p className="truncate text-xs text-muted">
              {table ? t("tableBadge", { label: table.label }) : t("counterBadge")}
            </p>
          </div>
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-40 pt-4">
        {!config.ordering && (
          <p className="mb-4 rounded-field border border-line bg-surface px-4 py-3 text-sm text-body">
            {t("browseOnlyHint")}
          </p>
        )}

        {/* Live sitting summary */}
        {attached && latestRound && (
          <button
            type="button"
            onClick={() => setBillOpen(true)}
            className="mb-4 flex w-full items-center gap-3 rounded-card border border-line bg-surface p-3.5 text-start transition-colors hover:border-primary"
          >
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary">
              <ReceiptText className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink">
                {t("roundsCount", { count: rounds.length })}
              </span>
              <span className="block text-xs text-muted">
                {t("roundLabel", { number: latestRound.roundNumber })} ·{" "}
                {t(`roundStatus.${roundStatus(latestRound, now)}`)}
              </span>
            </span>
            <span className="shrink-0 text-sm font-extrabold text-ink">
              {formatPrice(billTotal, currency)}
            </span>
          </button>
        )}

        {/* Search + section rail */}
        <div className="sticky top-16 z-20 -mx-4 bg-surface-alt/95 px-4 pb-2 pt-1 backdrop-blur">
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-11 w-full rounded-pill border border-line bg-surface ps-11 pe-10 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("clearSearch")}
                className="absolute end-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>

          {!q && menu.length > 1 && (
            <nav
              aria-label={t("sections")}
              className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1"
            >
              {menu.map((section) => (
                <a
                  key={section.id}
                  href={`#qr-${section.id}`}
                  className="shrink-0 rounded-pill border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-body transition-colors hover:border-primary hover:text-primary"
                >
                  {section.name}
                </a>
              ))}
            </nav>
          )}
        </div>

        {sections.length === 0 ? (
          <p className="py-16 text-center text-body">{t("noResults", { query })}</p>
        ) : (
          sections.map((section) => (
            <section key={section.id} id={`qr-${section.id}`} className="scroll-mt-36 pt-5">
              <h2 className="text-h3 text-ink">{section.name}</h2>
              <div className="mt-3 space-y-2.5">
                {section.items.map((item) => (
                  <QrItemRow
                    key={item.id}
                    item={item}
                    vendor={cartVendor}
                    ordering={config.ordering}
                    onAdd={handleAdd}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        <footer className="mt-10 text-center">
          <Link
            href={`/restaurants/${vendor.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-body transition-colors hover:text-primary"
          >
            {t("viewFullSite")}
            <ExternalLink className="size-3.5 rtl:-scale-x-100" aria-hidden />
          </Link>
          <p className="mt-2 text-xs text-muted">{t("poweredBy")}</p>
        </footer>
      </main>

      {/* Bottom bar — the only persistent controls */}
      {attached && (hasService || count > 0 || rounds.length > 0) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-2.5 px-4 py-3">
            {hasService && (
              <button
                type="button"
                onClick={() => setServiceOpen(true)}
                className="inline-flex h-12 shrink-0 items-center gap-2 rounded-pill border border-line px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
              >
                <BellRing className="size-4.5" aria-hidden />
                {t("service")}
              </button>
            )}

            {count > 0 ? (
              <button
                type="button"
                onClick={openTicket}
                className="inline-flex h-12 flex-1 items-center justify-between gap-3 rounded-pill bg-primary px-5 font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 active:scale-[0.99]"
              >
                <span className="inline-flex items-center gap-2">
                  <Badge
                    tone="neutral"
                    className="bg-white/20 text-white tabular-nums"
                  >
                    {count}
                  </Badge>
                  {t("reviewOrder")}
                </span>
                <span className="tabular-nums">
                  {formatPrice(roundPricing.total, currency)}
                </span>
              </button>
            ) : (
              rounds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setBillOpen(true)}
                  className="inline-flex h-12 flex-1 items-center justify-between gap-3 rounded-pill border border-line px-5 font-semibold text-ink transition-colors hover:bg-surface-muted"
                >
                  <span>{t("viewBill")}</span>
                  <span className="tabular-nums">{formatPrice(billTotal, currency)}</span>
                </button>
              )
            )}
          </div>
        </div>
      )}

      <QrWelcomeDialog
        vendor={vendor}
        config={config}
        tableLabel={table?.label ?? null}
        open={showWelcome}
        onStart={start}
      />
      <QrTicketPanel
        vendor={cartVendor}
        config={config}
        open={isTicketOpen}
        onClose={closeTicket}
      />
      <QrBillPanel
        vendor={cartVendor}
        config={config}
        now={now}
        open={billOpen}
        onClose={() => setBillOpen(false)}
      />
      <QrServiceSheet
        vendorId={vendor.id}
        config={config}
        now={now}
        open={serviceOpen}
        onClose={() => setServiceOpen(false)}
      />
    </div>
  );
}
