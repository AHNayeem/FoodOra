"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { UtensilsCrossed } from "lucide-react";
import type { CmsMenuItem, CmsSite } from "@/types";
import { useCmsMenu, useCmsSite } from "@/components/cms/use-cms-content";

/**
 * SiteFooter — the marketing footer.
 *
 * Since C26 both halves are content: the columns are the CMS `footer` menu
 * grouped by its own `group` field (spec: CMS — Footer, Menus), and the brand
 * line, tagline and small print come from the single `site` document. Add a link
 * in `/admin/cms` and it appears here; the column it lands in is the group it
 * was given.
 */
const COLUMNS = [
  { group: "company", headingKey: "footer.company" },
  { group: "legal", headingKey: "footer.legal" },
  { group: "business", headingKey: "nav.forBusiness" },
] as const;

export function SiteFooter({ menu, site }: { menu: CmsMenuItem[]; site: CmsSite | null }) {
  const t = useTranslations();
  const items = useCmsMenu("footer", menu);
  const brand = useCmsSite(
    site ?? {
      brandName: t("common.appName"),
      tagline: t("common.tagline"),
      description: "",
      supportEmail: "",
      supportPhone: "",
      address: "",
      twitter: "",
      instagram: "",
      facebook: "",
      footerNote: "",
    },
  );

  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-line bg-surface-muted">
      <div className="container-site grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="max-w-xs">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-ink">
            <span className="inline-flex size-9 items-center justify-center rounded-pill bg-primary text-white">
              <UtensilsCrossed className="size-5" aria-hidden />
            </span>
            <span className="text-lg">{brand.brandName || t("common.appName")}</span>
          </Link>
          <p className="mt-3 text-sm text-body">{brand.tagline || t("common.tagline")}</p>
          {brand.supportEmail && (
            <a
              href={`mailto:${brand.supportEmail}`}
              className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
            >
              {brand.supportEmail}
            </a>
          )}
        </div>

        {COLUMNS.map((column) => {
          const links = items.filter((item) => item.group === column.group);
          if (links.length === 0) return null;
          return (
            <div key={column.group}>
              <h3 className="text-sm font-bold text-ink">{t(column.headingKey)}</h3>
              <ul className="mt-4 space-y-2.5">
                {links.map((link) => (
                  <li key={link.id}>
                    <Link href={link.href} className="text-sm text-body hover:text-primary">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line">
        <div className="container-site flex flex-col items-center justify-between gap-2 py-5 text-sm text-muted sm:flex-row">
          <p>
            © {brand.brandName || t("common.appName")} {year}. {t("footer.rights")}
          </p>
          {brand.footerNote && <p>{brand.footerNote}</p>}
        </div>
      </div>
    </footer>
  );
}
