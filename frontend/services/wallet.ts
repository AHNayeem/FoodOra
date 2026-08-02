import type { Wallet } from "@/frontend/types";
import { wallet } from "@/frontend/lib/mock";
import { MAX_TOP_UP, MIN_TOP_UP, coversAmount, type TopUpMethod } from "@/frontend/lib/wallet";
import { mockDelay, ok, type Result } from "./http";

/**
 * wallet.ts — simulated wallet data access (Phase C3, extended in C19).
 *
 * C3 read a balance. C19 moves money: a top-up is authorised here and a wallet
 * payment is authorised here, both through the same `Promise<Result<T>>`
 * envelope the card gateway uses in `services/orders.ts`. Nothing in this file
 * mutates anything — it decides whether the money is *allowed* to move, and the
 * persisted store appends the transaction that moves it. Phase E replaces these
 * three functions with endpoints and the callers do not change.
 */

/** Return the signed-in customer's wallet (demo: the seeded ledger). */
export async function getWallet(): Promise<Wallet> {
  return mockDelay(wallet, 250);
}

/** How long a top-up "takes" — long enough for the button to say so. */
export const TOP_UP_PROCESSING_MS = 1100;

export interface TopUpResult {
  amount: number;
  /** Ledger description for the credit, already resolved by the "gateway". */
  description: string;
  reference: string;
}

/**
 * Authorise a top-up. Bounded like a real one, and deliberately declines a
 * reserved amount so the failure path can be demonstrated on purpose rather
 * than at random (the same trick as the reserved card number at checkout).
 */
export async function topUpWallet(input: {
  amount: number;
  method: TopUpMethod;
}): Promise<Result<TopUpResult>> {
  if (!Number.isFinite(input.amount) || input.amount < MIN_TOP_UP) {
    return { data: null, error: "errors.topUpMin" };
  }
  if (input.amount > MAX_TOP_UP) {
    return { data: null, error: "errors.topUpMax" };
  }

  await mockDelay(null, TOP_UP_PROCESSING_MS);

  // The one amount the simulated gateway refuses.
  if (input.amount === 1234) {
    return { data: null, error: "errors.topUpDeclined" };
  }

  return ok({
    amount: input.amount,
    description:
      input.method === "card" ? "Added via card ending 4242" : "Added via mobile banking",
    reference: `TOP-${Date.now().toString(36).toUpperCase().slice(-6)}`,
  });
}

/**
 * Authorise paying `amount` from a wallet holding `balance`.
 *
 * The balance is passed in because the prototype's wallet lives in a persisted
 * client store; a real endpoint would read it server-side and this signature
 * would lose the argument. What it must not lose is the check itself — the UI
 * disables an unaffordable wallet tender, but a tender is not where the rule
 * belongs, since the total can move (a tip added, a coupon expiring) after the
 * tender was picked.
 */
export async function authoriseWalletPayment(input: {
  balance: number;
  amount: number;
}): Promise<Result<{ authCode: string }>> {
  if (!coversAmount(input.balance, input.amount)) {
    return { data: null, error: "errors.insufficientFunds" };
  }
  await mockDelay(null, 900);
  return ok({ authCode: `WAL-${Date.now().toString(36).toUpperCase().slice(-6)}` });
}
