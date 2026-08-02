import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrderTracking } from "@/frontend/components/tracking/order-tracking";

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tracking");
  return { title: t("title"), robots: { index: false } };
}

/**
 * Order tracking (Phase C9). The order id comes from the path; the client
 * tracker resolves it from the persisted orders store and simulates the live
 * delivery/pickup progression. Per-order pages are private, so they are not
 * indexed and not statically generated.
 */
export default async function OrderTrackingPage({ params }: { params: Params }) {
  const { id } = await params;
  return <OrderTracking orderId={id} />;
}
