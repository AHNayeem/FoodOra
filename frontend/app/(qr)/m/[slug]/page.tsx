import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getVendorBySlug, getVendorMenu } from "@/frontend/services/catalog";
import { getQrMenuConfig, getQrTable } from "@/frontend/services/qr";
import { QR_TABLE_PARAM } from "@/frontend/lib/qr";
import { QrMenuView } from "@/frontend/components/qr/qr-menu-view";
import type { CartVendor } from "@/frontend/types";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) return {};
  const t = await getTranslations("qr");
  return { title: t("metaTitle", { name: vendor.name }) };
}

/**
 * QR Menu (Phase C12) — what a printed table code resolves to.
 *
 * The short `/m/<slug>` path is deliberate: it is printed on table tents and
 * occasionally typed by hand, so it stays away from `/restaurants/…`. The
 * table travels as `?t=<table id>`; a code with no table (the venue-wide one at
 * the entrance) still works and simply drops the table-only affordances.
 *
 * Dynamic rather than prerendered — the table is part of the request, exactly
 * as it would be against a real endpoint.
 */
export default async function QrMenuPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);

  const vendor = await getVendorBySlug(slug);
  if (!vendor) notFound();

  const tableParam = raw[QR_TABLE_PARAM];
  const [menu, config, table] = await Promise.all([
    getVendorMenu(vendor.id),
    getQrMenuConfig(vendor.id),
    getQrTable(vendor.id, typeof tableParam === "string" ? tableParam : null),
  ]);

  const cartVendor: CartVendor = {
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    currency: vendor.currency,
    countryCode: vendor.location.countryCode,
    deliveryFee: vendor.deliveryFee,
    minOrder: vendor.minOrder,
    freeDeliveryOver: vendor.freeDeliveryOver,
  };

  return (
    <QrMenuView
      vendor={vendor}
      cartVendor={cartVendor}
      menu={menu}
      config={config}
      table={table}
    />
  );
}
