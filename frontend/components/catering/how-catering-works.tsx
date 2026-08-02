import { getTranslations } from "next-intl/server";

/**
 * HowCateringWorks — the three-step explainer on the catering directory
 * (Phase C17). Server component; mirrors the landing "how it works" pattern.
 */
export async function HowCateringWorks() {
  const t = await getTranslations("catering");

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
            <span className="inline-flex size-10 items-center justify-center rounded-pill bg-primary/10 text-lg font-bold text-primary">
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
