import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReviewsView } from "@/frontend/components/account/reviews-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("nav.reviews"), robots: { index: false } };
}

/** My reviews (Phase C22). Orders still owed a rating + everything written; not indexed. */
export default function AccountReviewsPage() {
  return <ReviewsView />;
}
