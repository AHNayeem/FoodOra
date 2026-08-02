import type {
  CustomerSettings,
  NotificationChannels,
  NotificationTopic,
} from "@/types";
import { DEMO_PASSWORD, defaultCustomerSettings } from "@/lib/mock";
import { mockDelay, ok, type Result } from "./http";

/**
 * settings.ts — account settings, password and account closure (Phase C28).
 *
 * Same contract as the rest of the seam: async, `Result<T>`, error strings are
 * i18n keys the UI translates. The prototype has no credential store, so
 * `changePassword` checks the documented demo password — the validation shape a
 * real endpoint returns (wrong current password, weak new password, reuse) is
 * what the form is actually written against.
 */

/**
 * Channels a customer cannot switch off, because they carry the transactional
 * record of an order (receipts, refunds) we're obliged to send. It lives with
 * the seam rather than in the UI because the server is what enforces it; the
 * page renders these as locked controls so the rule is visible rather than
 * silently reverted.
 */
export const REQUIRED_NOTIFICATIONS: ReadonlyArray<
  readonly [NotificationTopic, keyof NotificationChannels]
> = [["orderUpdates", "email"]];

export async function getSettings(): Promise<CustomerSettings> {
  return mockDelay(defaultCustomerSettings, 200);
}

/**
 * Persist a settings change. Simulated: echoes the merged object a real
 * endpoint would return, so the caller commits the server's answer rather than
 * assuming its optimistic edit stuck.
 */
export async function updateSettings(
  next: CustomerSettings,
): Promise<Result<CustomerSettings>> {
  await mockDelay(null, 400);
  return ok(next);
}

export interface PasswordChangeInput {
  current: string;
  next: string;
  confirm: string;
}

/** Minimum length a new password must clear (mirrors the register form). */
export const MIN_PASSWORD_LENGTH = 8;

export async function changePassword({
  current,
  next,
  confirm,
}: PasswordChangeInput): Promise<Result<null>> {
  await mockDelay(null, 600);
  if (current !== DEMO_PASSWORD) return { data: null, error: "errors.wrongPassword" };
  if (next.length < MIN_PASSWORD_LENGTH) return { data: null, error: "errors.weakPassword" };
  if (next === current) return { data: null, error: "errors.samePassword" };
  if (next !== confirm) return { data: null, error: "errors.passwordMismatch" };
  return ok(null);
}

/**
 * Close the account. A real backend soft-deletes, revokes sessions and starts a
 * retention window; here it only resolves, and the caller is responsible for
 * clearing the local session and stores.
 */
export async function deleteAccount(reason: string): Promise<Result<null>> {
  await mockDelay(reason, 800);
  return ok(null);
}
