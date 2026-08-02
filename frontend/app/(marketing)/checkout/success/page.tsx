import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrderConfirmation } from "@/frontend/components/checkout/order-confirmation";

type SearchParams = Promise<{ order?: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("order");
  return { title: t("confirmedTitle"), robots: { index: false } };
}

/**
 * Order confirmation (Phase C8). Reads the placed order id from the query
 * string and hands it to the client confirmation view, which resolves the
 * order from the persisted orders store.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { order } = await searchParams;
  return <OrderConfirmation orderId={order ?? ""} />;
}
