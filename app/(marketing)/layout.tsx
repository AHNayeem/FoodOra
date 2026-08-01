import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CartMount } from "@/components/cart/cart-mount";
import { AssistantMount } from "@/components/ai/assistant-mount";

/** Marketing group layout — public site chrome (header + footer) + cart overlays. */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <CartMount />
      {/* The food assistant, reachable from every public page (Phase C24). */}
      <AssistantMount />
    </>
  );
}
