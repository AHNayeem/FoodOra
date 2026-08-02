import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { QuoteConfirmation } from "@/frontend/components/catering/quote-confirmation";

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catering");
  return { title: t("quoteSentTitle"), robots: { index: false } };
}

/**
 * Quote confirmation / status (Phase C17). Reads the quote id from the route and
 * hands it to the client view, which resolves the quote from the persisted
 * quotes store (the "database" of submitted requests in the prototype).
 */
export default async function QuoteStatusPage({ params }: { params: Params }) {
  const { id } = await params;
  return <QuoteConfirmation quoteId={id} />;
}
