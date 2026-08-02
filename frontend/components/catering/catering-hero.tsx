import { getTranslations } from "next-intl/server";
import { CalendarDays, ClipboardList, Users } from "lucide-react";

/**
 * CateringHero — the intro banner for the catering directory (Phase C17).
 * Server component: sets the premium tone and states the value prop (custom
 * quotes, any event size, calendar booking) before the caterer grid.
 */
export async function CateringHero() {
  const t = await getTranslations("catering");

  const points = [
    { icon: ClipboardList, label: t("heroPoint1") },
    { icon: Users, label: t("heroPoint2") },
    { icon: CalendarDays, label: t("heroPoint3") },
  ];

  return (
    <section className="relative overflow-hidden border-b border-line bg-gradient-to-br from-primary/10 via-surface to-accent/10">
      <div className="container-site py-12 md:py-16">
        <div className="max-w-2xl">
          <span className="inline-flex items-center rounded-pill bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            {t("heroEyebrow")}
          </span>
          <h1 className="mt-4 text-h1 text-ink md:text-5xl md:leading-tight">{t("heroTitle")}</h1>
          <p className="mt-3 text-lg text-body">{t("heroSubtitle")}</p>
        </div>

        <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
          {points.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-2 text-sm font-medium text-body">
              <span className="inline-flex size-9 items-center justify-center rounded-field bg-surface text-primary shadow-sm">
                <Icon className="size-4.5" aria-hidden />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
