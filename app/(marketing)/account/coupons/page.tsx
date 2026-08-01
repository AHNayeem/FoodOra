import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CouponsView } from "@/components/account/coupons-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("nav.coupons"), robots: { index: false } };
}

/** Coupon wallet (Phase C21). Backed by the persisted claims store; not indexed. */
export default function AccountCouponsPage() {
  return <CouponsView />;
}
