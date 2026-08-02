import { getLocale, getTranslations } from "next-intl/server";
import { getMenu, getSiteContent, readOptions } from "@/services/cms";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CartMount } from "@/components/cart/cart-mount";
import { AssistantMount } from "@/components/ai/assistant-mount";

/**
 * Marketing group layout — public site chrome (header + footer) + cart overlays.
 *
 * Since C26 the navigation and the brand line are CMS documents (spec: CMS —
 * Header, Footer, Menus), fetched here so both chrome components receive resolved
 * content rather than importing the constants themselves.
 */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const options = readOptions(locale, (key) => t(key));

  const [header, footer, site] = await Promise.all([
    getMenu("header", undefined, options),
    getMenu("footer", undefined, options),
    getSiteContent(undefined, options),
  ]);

  return (
    <>
      <SiteHeader menu={header} />
      <main className="flex-1">{children}</main>
      <SiteFooter menu={footer} site={site} />
      <CartMount />
      {/* The food assistant, reachable from every public page (Phase C24). */}
      <AssistantMount />
    </>
  );
}
