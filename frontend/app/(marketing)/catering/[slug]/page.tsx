import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Check, Sparkles } from "lucide-react";
import {
  getCateringServiceBySlug,
  getCateringServiceSlugs,
  getServiceAddOns,
  getServiceCuisines,
  getServicePackages,
} from "@/frontend/services/catering";
import type { CurrencyCode } from "@/frontend/config/regions";
import { formatPrice } from "@/frontend/lib/format";
import { ServiceHero } from "@/frontend/components/catering/service-hero";
import { PackageCard } from "@/frontend/components/catering/package-card";

type Params = Promise<{ slug: string }>;

/** Prerender every caterer at build time (spec: fast, SEO-friendly pages). */
export function generateStaticParams() {
  return getCateringServiceSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const service = await getCateringServiceBySlug(slug);
  if (!service) return {};
  return {
    title: service.name,
    description: service.description,
    openGraph: {
      title: service.name,
      description: service.tagline,
      images: [{ url: service.cover }],
    },
  };
}

/**
 * Caterer detail (Phase C17). Resolves the caterer by slug through the services
 * seam, 404s on miss, then loads its packages, add-ons and cuisines in parallel.
 * Statically generated per caterer via generateStaticParams.
 */
export default async function CateringServicePage({ params }: { params: Params }) {
  const { slug } = await params;
  const service = await getCateringServiceBySlug(slug);
  if (!service) notFound();

  const [packages, addOns, cuisines, t] = await Promise.all([
    getServicePackages(service.id),
    getServiceAddOns(service),
    getServiceCuisines(service),
    getTranslations("catering"),
  ]);
  const currency = service.currency as CurrencyCode;

  return (
    <div className="pb-16">
      <ServiceHero service={service} cuisines={cuisines} />

      <div className="container-site mt-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Main */}
          <div className="space-y-12">
            {/* Gallery */}
            {service.gallery.length > 0 && (
              <section>
                <h2 className="sr-only">{t("gallery")}</h2>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {service.gallery.map((src, i) => (
                    <div
                      key={src}
                      className={`relative aspect-[4/3] overflow-hidden rounded-card ${i === 0 ? "col-span-2 md:col-span-1" : ""}`}
                    >
                      <Image
                        src={src}
                        alt={`${service.name} — ${i + 1}`}
                        fill
                        sizes="(max-width: 768px) 50vw, 33vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Packages */}
            <section>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-h2 text-ink">{t("packagesTitle")}</h2>
                <span className="shrink-0 text-sm text-muted">
                  {t("packagesCount", { count: packages.length })}
                </span>
              </div>
              <p className="mt-1 text-body">{t("packagesSubtitle")}</p>
              {packages.length > 0 ? (
                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  {packages.map((pkg) => (
                    <PackageCard key={pkg.id} pkg={pkg} serviceSlug={service.slug} currency={currency} />
                  ))}
                </div>
              ) : (
                <p className="mt-6 rounded-panel border border-dashed border-line p-8 text-center text-body">
                  {t("noPackages")}
                </p>
              )}
            </section>

            {/* Add-ons */}
            {addOns.length > 0 && (
              <section>
                <h2 className="text-h2 text-ink">{t("addOnsTitle")}</h2>
                <p className="mt-1 text-body">{t("addOnsSubtitle")}</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {addOns.map((addOn) => (
                    <div key={addOn.id} className="flex items-start justify-between gap-3 rounded-card border border-line bg-surface p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{addOn.name}</p>
                        <p className="mt-0.5 text-xs text-muted">{addOn.description}</p>
                      </div>
                      <div className="shrink-0 text-end">
                        <p className="text-sm font-bold text-ink">{formatPrice(addOn.price, currency)}</p>
                        <p className="text-xs text-muted">
                          {addOn.unit === "per-guest" ? t("perGuest") : t("flatFee")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="flex h-fit flex-col gap-6 lg:sticky lg:top-20">
            <div className="rounded-panel border border-line bg-surface p-5">
              <h3 className="text-h3 text-ink">{t("about")}</h3>
              <p className="mt-2 text-sm text-body">{service.description}</p>
              <p className="mt-3 text-sm text-muted">{service.location.address}, {service.location.city}</p>
            </div>

            <div className="rounded-panel border border-line bg-surface p-5">
              <h3 className="text-h3 text-ink">{t("highlights")}</h3>
              <ul className="mt-3 space-y-2">
                {service.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm text-body">
                    <Check className="mt-0.5 size-4 shrink-0 text-fresh" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-panel border border-line bg-surface p-5">
              <h3 className="text-h3 text-ink">{t("serviceStyles")}</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {service.serviceStyles.map((st) => (
                  <span key={st} className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-medium text-body">
                    {t(`style.${st}`)}
                  </span>
                ))}
              </div>
            </div>

            <a
              href={`/catering/${service.slug}/quote`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-primary px-6 font-semibold text-white transition-colors hover:bg-primary-600"
            >
              <Sparkles className="size-4.5" aria-hidden />
              {t("requestQuote")}
            </a>
          </aside>
        </div>
      </div>
    </div>
  );
}
