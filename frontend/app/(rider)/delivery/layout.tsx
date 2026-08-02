import type { Metadata } from "next";
import { RiderShell } from "@/frontend/components/rider/rider-shell";

/**
 * Rider app layout (Phase C18). Its own `(rider)` route group, so the delivery
 * partner's app inherits none of the marketing chrome — no site header, no
 * footer, no customer cart — and none of the vendor dashboard's either. The shell
 * provides a phone-shaped frame, the on-shift switch and the bottom tab bar, and
 * enforces the client-side auth + rider-role gate.
 *
 * The whole section is private, so it is kept out of search results. Note the
 * public "become a rider" pitch page stays at `/rider`; this is the app itself.
 */
export const metadata: Metadata = {
  title: "Rider App",
  robots: { index: false, follow: false },
};

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return <RiderShell>{children}</RiderShell>;
}
