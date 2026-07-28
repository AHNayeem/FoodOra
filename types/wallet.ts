import type { BaseEntity, ISODate } from "./common";

/**
 * wallet.ts — the customer's in-app wallet (Phase C3).
 *
 * In the prototype the wallet is a client-persisted balance + ledger seeded
 * from the mock layer; `payWallet` at checkout and top-ups in the account app
 * move money by appending signed transactions. Every shape extends the standard
 * entity base so it maps 1:1 onto the eventual Prisma `Wallet` / `WalletTxn`
 * models when the Phase E backend arrives.
 */

/** What moved the balance. Credits are positive, debits negative. */
export type WalletTransactionType = "top-up" | "payment" | "refund" | "reward";

export interface WalletTransaction extends BaseEntity {
  type: WalletTransactionType;
  /** Signed amount in the wallet currency (credit > 0, debit < 0). */
  amount: number;
  description: string;
  /** Human order reference this txn relates to, when applicable. */
  orderNumber: string | null;
  occurredAt: ISODate;
}

export interface Wallet {
  currency: string;
  balance: number;
  transactions: WalletTransaction[];
}
