import type { Wallet } from "@/types";
import { wallet } from "@/lib/mock";
import { mockDelay } from "./http";

/**
 * wallet.ts — simulated wallet data access (Phase C3). Returns the signed-in
 * customer's wallet (demo: the seeded ledger) through the same async signature
 * a real endpoint will have. The account app caches it in a persisted store so
 * top-ups survive a refresh; swapping in the Phase E backend touches only this
 * file.
 */
export async function getWallet(): Promise<Wallet> {
  return mockDelay(wallet, 250);
}
