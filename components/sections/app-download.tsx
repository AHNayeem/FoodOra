import { getTranslations } from "next-intl/server";
import { BellRing, Wallet, Sparkles } from "lucide-react";
import { StoreBadges } from "./store-badges";

/**
 * AppDownload — "get the app" CTA band (server component). A stylised phone
 * mockup (pure CSS, no image asset) sits beside the value points and store
 * badges. RTL-safe: the copy column stays first via source order + grid.
 */
export async function AppDownload() {
  const t = await getTranslations("home");

  const perks = [
    { icon: BellRing, key: "appPerk1" },
    { icon: Wallet, key: "appPerk2" },
    { icon: Sparkles, key: "appPerk3" },
  ] as const;

  return (
    <section className="container-site py-16">
      <div className="relative overflow-hidden rounded-panel bg-primary px-6 py-12 text-white sm:px-12 lg:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -end-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-h2">{t("appTitle")}</h2>
            <p className="mt-3 max-w-md text-white/85">{t("appSubtitle")}</p>

            <ul className="mt-8 space-y-4">
              {perks.map(({ icon: Icon, key }) => (
                <li key={key} className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-white/15">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="pt-1.5 text-sm text-white/90">{t(key)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <StoreBadges />
            </div>
          </div>

          {/* Pure-CSS phone mockup — decorative. */}
          <div aria-hidden className="hidden justify-center lg:flex">
            <div className="relative h-[26rem] w-56 rounded-[2.5rem] border-8 border-ink/80 bg-surface shadow-2xl">
              <div className="absolute inset-x-0 top-0 mx-auto mt-2 h-5 w-24 rounded-pill bg-ink/80" />
              <div className="flex h-full flex-col gap-3 overflow-hidden rounded-[2rem] p-4 pt-8">
                <div className="h-24 rounded-card bg-gradient-to-br from-primary/20 to-accent/20" />
                <div className="h-3 w-2/3 rounded-pill bg-line" />
                <div className="h-3 w-1/2 rounded-pill bg-line" />
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className="h-20 rounded-card bg-surface-muted" />
                  <div className="h-20 rounded-card bg-surface-muted" />
                  <div className="h-20 rounded-card bg-surface-muted" />
                  <div className="h-20 rounded-card bg-surface-muted" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
