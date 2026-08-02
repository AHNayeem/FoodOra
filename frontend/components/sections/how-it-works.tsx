import { getTranslations } from "next-intl/server";
import { MapPin, UtensilsCrossed, Bike } from "lucide-react";

/**
 * HowItWorks — three-step explainer band (server component). Copy comes from the
 * `home` namespace; icons and step order live here as presentation.
 */
export async function HowItWorks() {
  const t = await getTranslations("home");

  const steps = [
    { icon: MapPin, key: "step1" },
    { icon: UtensilsCrossed, key: "step2" },
    { icon: Bike, key: "step3" },
  ] as const;

  return (
    <section className="bg-surface-muted">
      <div className="container-site py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-h2 text-ink">{t("howItWorks")}</h2>
          <p className="mt-2 text-body">{t("howItWorksSubtitle")}</p>
        </div>

        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map(({ icon: Icon, key }, i) => (
            <li key={key} className="relative text-center">
              <span className="relative mx-auto flex size-16 items-center justify-center rounded-pill bg-surface text-primary shadow-card ring-1 ring-line">
                <Icon className="size-7" aria-hidden />
                <span className="absolute -end-1 -top-1 flex size-6 items-center justify-center rounded-pill bg-primary text-xs font-bold text-white">
                  {i + 1}
                </span>
              </span>
              <h3 className="mt-5 text-lg font-bold text-ink">
                {t(`${key}Title`)}
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-body">{t(`${key}Body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
