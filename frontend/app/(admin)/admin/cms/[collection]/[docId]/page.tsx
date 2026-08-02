import type { Metadata } from "next";
import { DocumentEditor } from "@/frontend/components/admin/cms/document-editor";

/** Private surface — never indexed. */
export const metadata: Metadata = {
  title: "Edit content",
  robots: { index: false, follow: false },
};

type Params = Promise<{ collection: string; docId: string }>;

/**
 * One document, in the editor every collection shares. The document is resolved
 * client-side because a document created on this device exists only in the
 * browser's own store — there is nothing for the server to look up.
 */
export default async function AdminCmsDocumentPage({ params }: { params: Params }) {
  const { docId } = await params;
  return <DocumentEditor documentId={docId} />;
}
