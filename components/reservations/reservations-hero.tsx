import { getTranslations } from "next-intl/server";
import { CalendarCheck, CheckCircle2, Users } from "lucide-react";
import { bookableVenueCount } from "@/services/reservations";

/** Directory hero for `/reservations` (Phase C16). */
export async function ReservationsHero() {
  const t = await getTranslations("reservations");

  return (
    <section className="border-b border-line bg-surface-alt">
      <div className="container-site py-12 md:py-16">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
          <CalendarCheck className="size-4" aria-hidden />
          {t("heroVenues", { count: bookableVenueCount() })}
        </span>
        <h1 className="mt-4 max-w-2xl text-h1 text-ink">{t("heroTitle")}</h1>
        <p className="mt-3 max-w-2xl text-lg text-body">{t("heroSubtitle")}</p>
      </div>
    </section>
  );
}

/** The three-step explainer under the venue grid. */
export async function HowBookingWorks() {
  const t = await getTranslations("reservations");
  const steps = [
    { icon: Users, title: t("how1Title"), body: t("how1Body") },
    { icon: CalendarCheck, title: t("how2Title"), body: t("how2Body") },
    { icon: CheckCircle2, title: t("how3Title"), body: t("how3Body") },
  ];

  return (
    <section>
      <h2 className="text-h2 text-ink">{t("howTitle")}</h2>
      <ol className="mt-6 grid gap-6 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-panel border border-line bg-surface p-6">
            <span className="inline-flex size-11 items-center justify-center rounded-field bg-primary/10 text-primary">
              <step.icon className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 flex items-baseline gap-2 text-h3 text-ink">
              <span className="text-sm font-extrabold text-muted">{index + 1}</span>
              {step.title}
            </h3>
            <p className="mt-1.5 text-body">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
