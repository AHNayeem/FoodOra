"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Order, OrderStatus } from "@/types";

/**
 * orders store — the client-side order history (Phase C8). In the prototype the
 * "database" of placed orders is this persisted store: `placeOrder` returns an
 * order, the checkout view commits it here, and confirmation (C8) / tracking
 * (C9) / order history (C3) all read it back by id. When the Phase E backend
 * arrives this becomes a thin cache of server-owned orders — the read API
 * (`getById`) stays identical.
 *
 * Mirrors the auth/cart stores: `skipHydration` + explicit rehydrate so SSR and
 * the first client render agree, with a `hydrated` flag components gate on.
 */
interface OrdersState {
  orders: Order[];
  hydrated: boolean;
  addOrder: (order: Order) => void;
  getById: (id: string) => Order | undefined;
  /** Persist a status change (e.g. the customer cancelling — Phase C9). */
  updateStatus: (id: string, status: OrderStatus) => void;
  setHydrated: () => void;
}

export const useOrders = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],
      hydrated: false,
      addOrder: (order) => set((s) => ({ orders: [order, ...s.orders] })),
      getById: (id) => get().orders.find((o) => o.id === id),
      updateStatus: (id, status) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o,
          ),
        })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-orders",
      partialize: (s) => ({ orders: s.orders }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
