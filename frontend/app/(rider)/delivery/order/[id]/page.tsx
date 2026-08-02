import { LiveTripView } from "@/frontend/components/rider/live-trip-view";

/**
 * Running one real customer order — the delivery half of the lifecycle
 * (collect → ride → arrive → OTP → delivered). Distinct from
 * `/delivery/trip/[id]`, which drives the synthesised multi-stop trips that
 * demonstrate batching and payouts.
 */
export default async function RiderLiveOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LiveTripView orderId={id} />;
}
