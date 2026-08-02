import type { User, UserRole } from "@/frontend/types";
import {
  DEMO_OTP,
  DEMO_PASSWORD,
  SEED_NOW,
  userByEmail,
  users,
} from "@/frontend/lib/mock";
import { mockDelay, ok, type Result } from "./http";

/**
 * auth.ts — simulated authentication. The spec is explicit: build the auth UI
 * and flows but implement NO backend, JWT, or credential store during the
 * prototype. Every function mirrors the async signature a real endpoint will
 * have (`Promise<Result<User>>`) so swapping in the Phase E backend touches
 * only this file. Error strings are i18n keys the UI translates.
 */

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: Extract<UserRole, "customer" | "restaurant-owner">;
}

export interface OtpVerifyInput {
  phone: string;
  code: string;
}

export type SocialProvider = "google" | "apple" | "facebook";

const clone = (u: User): User => ({ ...u });

/** Email + password sign-in. Any seeded account works with DEMO_PASSWORD. */
export async function login({
  email,
  password,
}: LoginInput): Promise<Result<User>> {
  await mockDelay(null, 600);
  const user = userByEmail.get(email.trim().toLowerCase());
  if (!user || password !== DEMO_PASSWORD) {
    return { data: null, error: "errors.invalidCredentials" };
  }
  return ok(clone(user));
}

/**
 * Register a new account. In the prototype we don't persist — we synthesize a
 * verified user object from the form so the session store has something real to
 * hold. A collision with a seeded email is surfaced so the flow feels genuine.
 */
export async function register(
  input: RegisterInput,
): Promise<Result<User>> {
  await mockDelay(null, 700);
  if (userByEmail.has(input.email.trim().toLowerCase())) {
    return { data: null, error: "errors.emailTaken" };
  }
  const user: User = {
    id: `usr_new_${input.email.split("@")[0]}`,
    name: input.name,
    email: input.email.trim().toLowerCase(),
    phone: input.phone,
    avatar: "",
    role: input.role,
    permissions: [],
    countryCode: "BD",
    currency: "BDT",
    locale: "en",
    isVerified: true,
    createdAt: SEED_NOW,
    updatedAt: SEED_NOW,
    deletedAt: null,
  };
  return ok(user);
}

/** Request an OTP for a phone number. Always succeeds; the code is DEMO_OTP. */
export async function requestOtp(phone: string): Promise<Result<{ phone: string }>> {
  await mockDelay(null, 500);
  return ok({ phone });
}

/** Verify an OTP. Accepts DEMO_OTP; resolves to the customer demo account. */
export async function verifyOtp({
  code,
}: OtpVerifyInput): Promise<Result<User>> {
  await mockDelay(null, 600);
  if (code !== DEMO_OTP) {
    return { data: null, error: "errors.invalidOtp" };
  }
  return ok(clone(users[0]));
}

/** Social sign-in — mocked; resolves to the customer demo account. */
export async function socialLogin(
  provider: SocialProvider,
): Promise<Result<User>> {
  await mockDelay(provider, 700);
  return ok(clone(users[0]));
}

/**
 * Request a password reset. Always returns ok (no account enumeration), just
 * like a real endpoint should. No email is actually sent in the prototype.
 */
export async function requestPasswordReset(
  email: string,
): Promise<Result<{ email: string }>> {
  await mockDelay(null, 600);
  return ok({ email });
}

/** Demo accounts surfaced on the sign-in screen so reviewers can log straight in. */
export function getDemoAccounts(): Array<{
  email: string;
  role: UserRole;
  password: string;
}> {
  return users.map((u) => ({
    email: u.email,
    role: u.role,
    password: DEMO_PASSWORD,
  }));
}
