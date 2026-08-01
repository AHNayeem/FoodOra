import type { Metadata } from "next";

/**
 * QR group layout (Phase C12). Its own route group so a scanned table menu
 * inherits none of the marketing chrome — no site header, no footer, no
 * delivery cart. The guest surface provides its own venue bar and bottom bar.
 *
 * Table URLs are per-venue, throwaway and carry a table id, so they are kept
 * out of search results.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function QrLayout({ children }: { children: React.ReactNode }) {
  return children;
}
