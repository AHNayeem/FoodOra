import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getCateringServiceBySlug,
  getServiceAddOns,
  getServicePackages,
} from "@/frontend/services/catering";
import { CateringQuoteBuilder } from "@/frontend/components/catering/catering-quote-builder";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ package?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [service, t] = await Promise.all([
    getCateringServiceBySlug(slug),
    getTranslations("catering"),
  ]);
  if (!service) return {};
  return {
    title: t("requestQuoteTitle"),
    description: t("requestQuoteSubtitle", { name: service.name }),
    robots: { index: false },
  };
}

/**
 * Quote builder host (Phase C17). Resolves the caterer + its packages and
 * add-ons server-side, maps the optional `?package=<slug>` deep link to a
 * package id, then hands everything to the client builder (which owns the form
 * state, live estimate and submission).
 */
export default async function CateringQuotePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { package: packageSlug } = await searchParams;

  const service = await getCateringServiceBySlug(slug);
  if (!service) notFound();

  const [packages, addOns] = await Promise.all([
    getServicePackages(service.id),
    getServiceAddOns(service),
  ]);

  const initialPackageId = packageSlug
    ? (packages.find((p) => p.slug === packageSlug)?.id ?? null)
    : null;

  return (
    <CateringQuoteBuilder
      service={service}
      packages={packages}
      addOns={addOns}
      initialPackageId={initialPackageId}
    />
  );
}
