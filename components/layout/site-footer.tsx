import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UtensilsCrossed } from "lucide-react";
import { footerNav } from "@/constants/navigation";
import { siteConfig } from "@/constants/site";

/** SiteFooter — marketing footer (server component). */
export async function SiteFooter() {
  const t = await getTranslations();

  return (
    <footer className="mt-auto border-t border-line bg-surface-muted">
      <div className="container-site grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="max-w-xs">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-ink">
            <span className="inline-flex size-9 items-center justify-center rounded-pill bg-primary text-white">
              <UtensilsCrossed className="size-5" aria-hidden />
            </span>
            <span className="text-lg">{t("common.appName")}</span>
          </Link>
          <p className="mt-3 text-sm text-body">{t("common.tagline")}</p>
        </div>

        <div>
          <h3 className="text-sm font-bold text-ink">{t("footer.company")}</h3>
          <ul className="mt-4 space-y-2.5">
            {footerNav.company.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-body hover:text-primary">
                  {t(l.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold text-ink">{t("footer.legal")}</h3>
          <ul className="mt-4 space-y-2.5">
            {footerNav.legal.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-body hover:text-primary">
                  {t(l.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold text-ink">{t("nav.forBusiness")}</h3>
          <ul className="mt-4 space-y-2.5">
            <li>
              <Link href="/partner" className="text-sm text-body hover:text-primary">
                {t("nav.restaurants")}
              </Link>
            </li>
            <li>
              <Link href="/rider" className="text-sm text-body hover:text-primary">
                Become a rider
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="container-site flex flex-col items-center justify-between gap-2 py-5 text-sm text-muted sm:flex-row">
          <p>
            © {siteConfig.name} 2026. {t("footer.rights")}
          </p>
          <p>Prototype — mock data only.</p>
        </div>
      </div>
    </footer>
  );
}
