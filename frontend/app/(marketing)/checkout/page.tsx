import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckoutView } from "@/frontend/components/checkout/checkout-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout");
  return { title: t("title") };
}

/**
 * Checkout (Phase C8). The page shell is a server component for metadata; the
 * interactive checkout is a client component because it reads the persisted
 * cart and writes the placed order to client stores (no backend in the
 * prototype).
 */
export default function CheckoutPage() {
  return <CheckoutView />;
}
