import type { SavedAddress, User } from "@/frontend/types";
import { savedAddresses } from "@/frontend/lib/mock";
import { mockDelay, ok, type Result } from "./http";

/**
 * account.ts — simulated customer-account operations (Phase C3): profile edits
 * and the address book. No backend in the prototype — `updateProfile` just
 * echoes the merged user a real endpoint would return, and `getAddressBook`
 * returns the seeded book. Every function mirrors the async `Result<T>`
 * signature the Phase E backend will use, so swapping it in touches only this
 * file. The client caches results in persisted stores.
 */

/** Fields of the profile a customer can edit in the account app. */
export type ProfilePatch = Pick<
  User,
  "name" | "phone" | "avatar" | "locale" | "currency"
>;

/** Persist a profile edit. Simulated: returns the merged user. */
export async function updateProfile(
  user: User,
  patch: ProfilePatch,
): Promise<Result<User>> {
  await mockDelay(null, 500);
  return ok({ ...user, ...patch, updatedAt: new Date().toISOString() });
}

/** The signed-in customer's saved addresses (demo: the seeded book). */
export async function getAddressBook(): Promise<SavedAddress[]> {
  return mockDelay(savedAddresses, 200);
}
