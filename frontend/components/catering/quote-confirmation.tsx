"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  MapPin,
  PackageX,
  Sparkles,
  Users,
} from "lucide-react";
import type { CateringQuote } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { useCatering } from "@/frontend/stores/catering";
import { formatPrice } from "@/frontend/lib/format";
import { EVENT_TYPE_EMOJI } from "@/frontend/lib/catering";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";

/**
 * QuoteConfirmation — the post-request confirmation + status screen (Phase C17).
 * Reads the just-submitted quote from the quotes store by id (persisted, so a
 * hard refresh still resolves it) and renders the brief the caterer received:
 * reference, status, event details, chosen package + add-ons and the indicative
 * estimate. "What happens next" sets expectations since pricing is confirmed
 * off-platform in the prototype.
 */
export function QuoteConfirmation({ quoteId }: { quoteId: string }) {
  const t = useTranslations("catering");
  const hydrated = useCatering((s) => s.hydrated);
  const quote = useCatering((s) => s.quotes.find((q) => q.id === quoteId));

  useEffect(() => {
    useCatering.persist.rehydrate();
  }, []);

  if (!hydrated) {
    return (
      <div className="container-site flex min-h-[50vh] items-center justify-center py-16">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="container-site flex min-h-[50vh] flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <PackageX className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">{t("quoteNotFound")}</h1>
        <p className="text-body">{t("quoteNotFoundHint")}</p>
        <Button href="/catering" className="mt-2">
          {t("browseCaterers")}
        </Button>
      </div>
    );
  }

  return <QuoteReceipt quote={quote} />;
}

const STATUS_TONE = {
  requested: "accent",
  reviewing: "accent",
  quoted: "primary",
  confirmed: "fresh",
  declined: "danger",
} as const;

function QuoteReceipt({ quote }: { quote: CateringQuote }) {
  const t = useTranslations("catering");
  const locale = useLocale();
  const currency = quote.service.currency as CurrencyCode;
  const { pricing } = quote;

  const eventDate = new Date(`${quote.eventDate}T00:00:00`).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const nextSteps = [t("next1"), t("next2"), t("next3")];

  return (
    <div className="container-site max-w-2xl py-10">
      {/* Success banner */}
      <div className="flex flex-col items-center text-center">
        <span className="animate-pop-in inline-flex size-16 items-center justify-center rounded-pill bg-fresh/15 text-fresh">
          <CheckCircle2 className="size-9" aria-hidden />
        </span>
        <h1 className="mt-4 text-h1 text-ink">{t("quoteSentTitle")}</h1>
        <p className="mt-1 text-body">{t("quoteSentSub", { name: quote.service.name })}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-pill bg-surface-muted px-4 py-1.5 text-sm font-semibold text-ink">
            {t("quoteNumber", { number: quote.quoteNumber })}
          </span>
          <Badge tone={STATUS_TONE[quote.status]}>{t(`status.${quote.status}`)}</Badge>
        </div>
      </div>

      {/* Event brief */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <InfoCard icon={Sparkles} label={t("summaryEvent")}>
          <span className="font-semibold text-ink">
            {EVENT_TYPE_EMOJI[quote.eventType]} {t(`event.${quote.eventType}`)}
          </span>
          <span className="block text-muted">{t(`style.${quote.serviceStyle}`)}</span>
        </InfoCard>
        <InfoCard icon={CalendarDays} label={t("summaryDate")}>
          <span className="font-semibold text-ink">{eventDate}</span>
        </InfoCard>
        <InfoCard icon={Users} label={t("summaryGuests")}>
          <span className="font-semibold text-ink">{t("guestCount", { count: quote.guests })}</span>
        </InfoCard>
        <InfoCard icon={MapPin} label={t("venueTitle")}>
          <span className="font-semibold text-ink">{quote.venue.area}, {quote.venue.city}</span>
          {quote.venue.address && <span className="block text-muted">{quote.venue.address}</span>}
        </InfoCard>
      </div>

      {/* Estimate */}
      <div className="mt-4 rounded-panel border border-line bg-surface p-5">
        <h2 className="text-h3 text-ink">{t("estimateTitle")}</h2>
        <p className="mt-0.5 text-sm text-muted">{quote.packageName ?? t("customMenuTitle")}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <Row
            label={t("estPackage", { price: formatPrice(pricing.pricePerGuest, currency), count: quote.guests })}
            value={formatPrice(pricing.packageSubtotal, currency)}
          />
          {quote.addOns.map((a) => (
            <Row key={a.id} label={a.name} value={formatPrice(a.amount, currency)} muted />
          ))}
          <Row label={t("estServiceFee")} value={formatPrice(pricing.serviceFee, currency)} />
          <Row label={pricing.taxLabel} value={formatPrice(pricing.tax, currency)} />
        </dl>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-base font-bold text-ink">
          <span>{t("estTotal")}</span>
          <span>{formatPrice(pricing.total, currency)}</span>
        </div>
        <p className="mt-1 text-xs text-muted">{t("estimateDisclaimer")}</p>
      </div>

      {quote.notes && (
        <div className="mt-4 rounded-panel border border-line bg-surface p-5">
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <FileText className="size-4" aria-hidden />
            {t("notesTitle")}
          </p>
          <p className="mt-1 text-sm text-body">{quote.notes}</p>
        </div>
      )}

      {/* What happens next */}
      <div className="mt-4 rounded-panel border border-primary/20 bg-primary/5 p-5">
        <h2 className="text-h3 text-ink">{t("whatsNextTitle")}</h2>
        <ol className="mt-3 space-y-2">
          {nextSteps.map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-sm text-body">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-pill bg-primary/15 text-xs font-bold text-primary">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button href={`/catering/${quote.service.slug}`} variant="outline" size="lg" className="flex-1">
          {t("viewCaterer")}
        </Button>
        <Button href="/catering" variant="ghost" size="lg" className="flex-1">
          {t("browseCaterers")}
        </Button>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-panel border border-line bg-surface p-5">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <Icon className="size-4" aria-hidden />
        {label}
      </p>
      <p className="mt-1.5 text-sm text-body">{children}</p>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={muted ? "text-muted" : "text-body"}>{label}</dt>
      <dd className={muted ? "font-medium text-muted" : "font-medium text-ink"}>{value}</dd>
    </div>
  );
}
