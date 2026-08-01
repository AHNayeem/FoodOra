import { TripView } from "@/components/rider/trip-view";

type Params = Promise<{ id: string }>;

/**
 * Running one trip (Phase C18). The trip id comes from the path; the client view
 * resolves it from the persisted rider store — the trip was captured there when it
 * was accepted, since offers are synthesised rather than stored. Private, so it is
 * neither indexed nor prerendered.
 */
export default async function RiderTripPage({ params }: { params: Params }) {
  const { id } = await params;
  return <TripView jobId={id} />;
}
