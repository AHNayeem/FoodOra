import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AddressBook } from "@/frontend/components/account/address-book";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("nav.addresses"), robots: { index: false } };
}

/** Address book (Phase C3). Backed by the persisted addresses store; not indexed. */
export default function AccountAddressesPage() {
  return <AddressBook />;
}
