import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CmsCollectionId } from "@/frontend/types";
import { cmsCollectionById } from "@/frontend/lib/mock/cms";
import { CollectionList } from "@/frontend/components/admin/cms/collection-list";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Content collection",
  robots: { index: false, follow: false },
};

type Params = Promise<{ collection: string }>;

/** One content collection's documents. */
export default async function AdminCmsCollectionPage({ params }: { params: Params }) {
  const { collection } = await params;
  if (!cmsCollectionById.has(collection as CmsCollectionId)) notFound();
  return <CollectionList collection={collection as CmsCollectionId} />;
}
