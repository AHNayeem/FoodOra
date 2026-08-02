"use client";

import { createContext, useContext } from "react";
import type { DeliveryZone, Rider } from "@/types";

/**
 * RiderContext — carries the resolved rider and their zone from the shell (which
 * does the auth gate and the lookup once) down to every screen, so no page
 * re-resolves "me". `setRider` exists because the profile screen can change the
 * vehicle or the zone, and the chrome above it has to follow.
 *
 * There is no server session in the prototype, so this is all client-side; Phase
 * E hydrates it from the request instead. Mirrors C10's `DashboardContext`.
 */
interface RiderValue {
  rider: Rider;
  zone: DeliveryZone;
  /** Commit a rider record the seam has returned (profile edits). */
  setRider: (rider: Rider) => void;
}

const RiderContext = createContext<RiderValue | null>(null);

export function RiderProvider({
  rider,
  zone,
  setRider,
  children,
}: RiderValue & { children: React.ReactNode }) {
  return (
    <RiderContext.Provider value={{ rider, zone, setRider }}>
      {children}
    </RiderContext.Provider>
  );
}

/** Read the signed-in rider. Throws if used outside the rider shell. */
export function useRiderApp(): RiderValue {
  const ctx = useContext(RiderContext);
  if (!ctx) throw new Error("useRiderApp must be used within RiderProvider");
  return ctx;
}
