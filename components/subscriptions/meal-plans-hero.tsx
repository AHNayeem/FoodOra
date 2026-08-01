import { getTranslations } from "next-intl/server";
import { CalendarCheck, PauseCircle, Wallet } from "lucide-react";

/**
 * MealPlansHero — the intro banner for the meal-plan directory (Phase C15).
 * Server component. It leads with the three things that make a subscription
 * different from ordering daily: it is cheaper, it is planned, and you can stop
 * it whenever you like.
 */
export async function MealPlansHero() {
  const t = await getTranslations("subscriptions");

  const points = [
    { icon: Wallet, label: t("heroPoint1") },
    { icon: CalendarCheck, label: t("heroPoint2") },
    { icon: PauseCircle, label: t("heroPoint3") },
  ];

  return (
    <section className="relative overflow-hidden border-b border-line bg-gradient-to-br from-fresh/10 via-surface to-primary/10">
      <div className="container-site py-12 md:py-16">
        <div className="max-w-2xl">
          <span className="inline-flex items-center rounded-pill bg-fresh/15 px-3 py-1 text-sm font-semibold text-fresh-600">
            {t("heroEyebrow")}
          </span>
          <h1 className="mt-4 text-h1 text-ink md:text-5xl md:leading-tight">
            {t("heroTitle")}
          </h1>
          <p className="mt-3 text-lg text-body">{t("heroSubtitle")}</p>
        </div>

        <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
          {points.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-2 text-sm font-medium text-body">
              <Icon className="size-5 text-fresh-600" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The three-step explainer under the plan grid. */
export async function HowPlansWork() {
  const t = await getTranslations("subscriptions");

  const steps = [
    { n: 1, title: t("step1Title"), body: t("step1Body") },
    { n: 2, title: t("step2Title"), body: t("step2Body") },
    { n: 3, title: t("step3Title"), body: t("step3Body") },
  ];

  return (
    <section className="rounded-panel border border-line bg-surface-alt p-6 md:p-10">
      <div className="max-w-xl">
        <h2 className="text-h2 text-ink">{t("howTitle")}</h2>
        <p className="mt-1 text-body">{t("howSubtitle")}</p>
      </div>
      <ol className="mt-8 grid gap-6 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="relative rounded-card bg-surface p-6 shadow-card">
            <span className="inline-flex size-10 items-center justify-center rounded-pill bg-fresh/10 text-lg font-bold text-fresh-600">
              {s.n}
            </span>
            <h3 className="mt-4 text-h3 text-ink">{s.title}</h3>
            <p className="mt-1.5 text-sm text-body">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
