"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Wallet, WalletTransaction, WalletTransactionType } from "@/types";

/**
 * wallet store — the customer's wallet balance + ledger (Phase C3). Seeds once
 * from the mock service (`getWallet`) then persists, so a simulated top-up
 * survives a refresh. Money only ever moves by appending a signed transaction
 * and re-summing, keeping the balance and ledger consistent. When the Phase E
 * backend arrives this becomes a cache of the server-owned wallet.
 */
interface WalletState {
  currency: string;
  balance: number;
  transactions: WalletTransaction[];
  hydrated: boolean;
  seeded: boolean;
  seed: (wallet: Wallet) => void;
  /** Simulated top-up: append a credit and bump the balance. */
  topUp: (amount: number) => void;
  /** Cashback earned by a coupon (Phase C21) — the same append, tagged a reward. */
  reward: (amount: number, description: string, orderNumber: string | null) => void;
  setHydrated: () => void;
}

/**
 * Money only ever moves by appending a signed transaction and re-summing, so
 * the balance and the ledger cannot drift apart. Both credits (a top-up, coupon
 * cashback) go through here.
 */
function credit(
  state: WalletState,
  amount: number,
  type: WalletTransactionType,
  description: string,
  orderNumber: string | null,
): Partial<WalletState> {
  const now = new Date().toISOString();
  const txn: WalletTransaction = {
    id: `wtx_${Date.now().toString(36)}`,
    type,
    amount,
    description,
    orderNumber,
    occurredAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  return { balance: state.balance + amount, transactions: [txn, ...state.transactions] };
}

export const useWallet = create<WalletState>()(
  persist(
    (set) => ({
      currency: "BDT",
      balance: 0,
      transactions: [],
      hydrated: false,
      seeded: false,
      seed: (wallet) =>
        set((s) =>
          s.seeded
            ? {}
            : {
                currency: wallet.currency,
                balance: wallet.balance,
                transactions: wallet.transactions,
                seeded: true,
              },
        ),
      topUp: (amount) =>
        set((s) => credit(s, amount, "top-up", "Added via card ending 4242", null)),
      reward: (amount, description, orderNumber) =>
        set((s) => credit(s, amount, "reward", description, orderNumber)),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-wallet",
      partialize: (s) => ({
        currency: s.currency,
        balance: s.balance,
        transactions: s.transactions,
        seeded: s.seeded,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
