import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WalletView } from "@/components/account/wallet-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("nav.wallet"), robots: { index: false } };
}

/** Wallet (Phase C3). Backed by the persisted wallet store; not indexed. */
export default function AccountWalletPage() {
  return <WalletView />;
}
