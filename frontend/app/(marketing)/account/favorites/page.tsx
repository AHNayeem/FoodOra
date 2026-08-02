import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FavoritesView } from "@/components/account/favorites-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("favorites");
  return { title: t("title"), robots: { index: false } };
}

/** Saved restaurants and dishes (Phase C23). Private, so not indexed. */
export default function AccountFavoritesPage() {
  return <FavoritesView />;
}
