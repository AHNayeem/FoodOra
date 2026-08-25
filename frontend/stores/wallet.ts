"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Wallet, WalletTransaction, WalletTransactionType } from "@/types";
import { wallet as seedWallet } from "@/lib/mock";
import { coversAmount, isSettled } from "@/lib/wallet";
import { walletNotification } from "@/lib/notifications";
import { emitNotifications } from "./notifications";
import { syncAcrossWindows } from "@/lib/store-sync";

/**
 * wallet store — the customer's wallet balance + ledger (Phase C3, made
 * spendable in C19).
 *
 * Seeds once from the mock service (`getWallet`) then persists, so money that
 * moves survives a refresh. **Money only ever moves by appending a signed
 * transaction and re-summing**, which is what keeps the balance and the ledger
 * from drifting apart — there is no setter for `balance`.
 *
 * C19 added the two directions that make it a payment instrument rather than a
 * statement: `pay` (checkout debits it) and `refundOrder` (the orders store
 * credits it back when a wallet-paid order fails). Both are order-scoped and
 * guarded by the ledger itself: a given order can be charged once and refunded
 * once, however many times a persisted, multi-tab store replays the change.
 *
 * When the Phase E backend arrives this becomes a cache of the server-owned
 * wallet and the actions become mutation calls; the signatures stay put.
 */
interface WalletState {
  currency: string;
  balance: number;
  transactions: WalletTransaction[];
  hydrated: boolean;
  seeded: boolean;
  seed: (wallet: Wallet) => void;
  /** Simulated top-up: append a credit and bump the balance. */
  topUp: (amount: number, description?: string) => void;
  /** Cashback earned by a coupon (Phase C21) — the same append, tagged a reward. */
  reward: (amount: number, description: string, orderNumber: string | null) => void;
  /**
   * Charge an order to the wallet (C19). Returns false — and moves nothing — if
   * the balance no longer covers it or the order was already charged.
   */
  pay: (amount: number, description: string, orderNumber: string) => boolean;
  /**
   * Return an order's money to the wallet (C19). Returns false if that order
   * was already refunded, so a replayed status change cannot pay out twice.
   */
  refundOrder: (amount: number, description: string, orderNumber: string) => boolean;
  /**
   * Bring the wallet up before writing to it from outside the account app.
   *
   * A refund is posted by the orders store, which can be reached from a surface
   * that never opened the wallet (the vendor board cancelling an order). Without
   * this the credit would land on an empty, unseeded wallet and the seed would
   * later overwrite it. Seeds from the mock ledger directly — the same shortcut
   * `stores/orders` takes for its demo working set, and idempotent either way.
   */
  ensureSeeded: () => void;
  setHydrated: () => void;
}

/**
 * The one place a transaction is minted. Every credit and every debit goes
 * through here, so the balance is always the running total of the ledger above
 * it — a signed amount, never a separate "add" and "subtract" path.
 */
function post(
  state: WalletState,
  amount: number,
  type: WalletTransactionType,
  description: string,
  orderNumber: string | null,
): Partial<WalletState> {
  const now = new Date().toISOString();
  const txn: WalletTransaction = {
    id: `wtx_${Date.now().toString(36)}_${type}`,
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

/**
 * Tell the customer about money that moved (C25).
 *
 * Called *after* the ledger is committed and never from inside the `set`
 * updater: an updater can be replayed (React strict mode does exactly that) and
 * a notification is not idempotent the way a pure state computation is.
 * `walletNotification` returns null for the movements the customer personally
 * watched happen — the debit at the tender — so only the ones worth a record
 * reach the inbox.
 */
function announce(state: WalletState) {
  const latest = state.transactions[0];
  if (!latest) return;
  const notification = walletNotification(latest, state.currency);
  if (notification) emitNotifications([notification]);
}

export const useWallet = create<WalletState>()(
  persist(
    (set, get) => ({
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
      topUp: (amount, description = "Added via card ending 4242") => {
        set((s) => post(s, amount, "top-up", description, null));
        announce(get());
      },
      reward: (amount, description, orderNumber) => {
        set((s) => post(s, amount, "reward", description, orderNumber));
        announce(get());
      },

      pay: (amount, description, orderNumber) => {
        const s = get();
        // Re-checked here and not only at the tender: the total can move after
        // the customer picks the wallet, and the service authorises against the
        // same balance this line reads.
        if (!coversAmount(s.balance, amount)) return false;
        if (isSettled(s.transactions, orderNumber, "payment")) return false;
        set((cur) => post(cur, -amount, "payment", description, orderNumber));
        return true;
      },

      refundOrder: (amount, description, orderNumber) => {
        get().ensureSeeded();
        if (isSettled(get().transactions, orderNumber, "refund")) return false;
        set((cur) => post(cur, amount, "refund", description, orderNumber));
        announce(get());
        return true;
      },

      ensureSeeded: () => {
        // Optional: outside a browser (tests, SSR) there is no storage to read
        // back, and the seed below is all that is needed.
        if (!get().hydrated) void useWallet.persist?.rehydrate();
        if (get().seeded) return;
        get().seed(seedWallet);
      },

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

/**
 * Rehydrate this store when another window writes to it (Phase 18, G42) — one
 * surface accepting, blocking or paying changes what the surface in the next tab
 * is looking at, without a reload.
 */
syncAcrossWindows("foodora-wallet", () => void useWallet.persist.rehydrate());
