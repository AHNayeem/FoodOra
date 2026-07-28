"use client";

import { createContext, useContext } from "react";
import type { Vendor } from "@/types";

/**
 * DashboardContext — carries the resolved "my restaurant" vendor from the shell
 * (which does the auth gate + lookup once) down to every dashboard page, so
 * pages don't each re-resolve it. There is no server session in the prototype,
 * so this all happens client-side; Phase E would hydrate it from the request.
 */
interface DashboardValue {
  vendor: Vendor;
}

const DashboardContext = createContext<DashboardValue | null>(null);

export function DashboardProvider({
  vendor,
  children,
}: {
  vendor: Vendor;
  children: React.ReactNode;
}) {
  return (
    <DashboardContext.Provider value={{ vendor }}>
      {children}
    </DashboardContext.Provider>
  );
}

/** Read the active vendor. Throws if used outside the dashboard shell. */
export function useDashboard(): DashboardValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
