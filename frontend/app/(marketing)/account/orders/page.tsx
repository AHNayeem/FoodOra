import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrderHistory } from "@/frontend/components/account/order-history";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("nav.orders"), robots: { index: false } };
}

/** Order history (Phase C3). Reads the persisted orders store; not indexed. */
export default function AccountOrdersPage() {
  return <OrderHistory />;
}
