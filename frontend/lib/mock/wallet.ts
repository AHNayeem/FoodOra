import type { Wallet, WalletTransaction } from "@/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * wallet.ts — the demo customer's wallet ledger, surfaced in the account app
 * (Phase C3) and spent at checkout (C19 — which is why the balance below is the
 * *only* opening balance; the hard-coded one checkout used to show is gone).
 * Tied to `usr_customer`; maps onto the future `Wallet` / `WalletTransaction`
 * models.
 * The opening balance equals the sum of the seeded transactions so the ledger
 * is internally consistent.
 */
const seedTransactions: WalletTransaction[] = [
  {
    ...base,
    id: "wtx_reward",
    type: "reward",
    amount: 150,
    description: "Welcome bonus",
    orderNumber: null,
    occurredAt: "2026-07-10T09:15:00.000Z",
  },
  {
    ...base,
    id: "wtx_topup_1",
    type: "top-up",
    amount: 2000,
    description: "Added via card ending 4242",
    orderNumber: null,
    occurredAt: "2026-07-18T14:02:00.000Z",
  },
  {
    ...base,
    id: "wtx_payment_1",
    type: "payment",
    amount: -640,
    description: "Order at Spice Garden",
    orderNumber: "FO-4A9C21",
    occurredAt: "2026-07-20T19:41:00.000Z",
  },
  {
    ...base,
    id: "wtx_refund_1",
    type: "refund",
    amount: 320,
    description: "Refund — cancelled order",
    orderNumber: "FO-1B77E0",
    occurredAt: "2026-07-22T12:08:00.000Z",
  },
  {
    ...base,
    id: "wtx_topup_2",
    type: "top-up",
    amount: 620,
    description: "Added via card ending 4242",
    orderNumber: null,
    occurredAt: "2026-07-25T08:30:00.000Z",
  },
];

/** Opening balance = running total of the seeded ledger (150+2000−640+320+620). */
export const wallet: Wallet = {
  currency: "BDT",
  balance: seedTransactions.reduce((sum, t) => sum + t.amount, 0),
  // Newest first, matching how the account app renders the ledger.
  transactions: [...seedTransactions].reverse(),
};
