import type { User, UserRole } from "@/types";
import {
  DEMO_OTP,
  DEMO_PASSWORD,
  SEED_NOW,
  userByEmail,
  users,
} from "@/lib/mock";
import { LIVE } from "@/config/backend";
import { getClient, resetClient } from "@/lib/graphql/client";
import { attempt, fromPayload, refuse } from "@/lib/graphql/result";
import {
  bootstrap,
  clearSession,
  currentSession,
  revokeSession,
  setSession,
} from "@/lib/graphql/session";
import {
  type AuthSessionData,
  LOGIN,
  LOGOUT,
  REGISTER,
  REQUEST_OTP,
  REQUEST_PASSWORD_RESET,
  VERIFY_OTP,
} from "@/lib/graphql/auth.operations";
import { mockDelay, ok, type Result } from "./http";

/**
 * auth.ts — authentication.
 *
 * Every function keeps the signature it has had since Phase C
 * (`Promise<Result<User>>`, i18n keys for errors), because that is the seam the
 * whole cutover rests on: the forms, the toasts and the session store are
 * unchanged, only the data source moves. Each function has two bodies — the real
 * one, and the Phase C mock it falls back to while `LIVE.auth` is off — so the app
 * keeps working at every step of V1 (Unit 0).
 *
 * The API returns an `AuthSession`, not a bare user: an access token for
 * `Authorization: Bearer`, its expiry, and a session id, with the refresh token
 * leaving separately as an `httpOnly` cookie. `lib/graphql/session.ts` keeps the
 * token in memory; the components still only ever see the `User`.
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
  /**
   * Phase 7 (G10) added `delivery-rider`: `/rider` had no way to create an
   * account at all, so "become a rider" was unreachable even after the
   * application form existed. Registering as a rider creates the *account*, not
   * the fleet record — that is minted when an application is approved.
   */
  role: Extract<UserRole, "customer" | "restaurant-owner" | "delivery-rider">;
}

export interface OtpVerifyInput {
  phone: string;
  code: string;
}

export type SocialProvider = "google" | "apple" | "facebook";

const clone = (u: User): User => ({ ...u });

/**
 * Install the session and hand back the user.
 *
 * One place, because all three sign-in paths — password, registration, OTP — return
 * the same payload, and a path that forgot to store the token would look like a
 * successful sign-in whose every subsequent query is unauthenticated.
 */
function completeSignIn(session: AuthSessionData): Result<User> {
  setSession(session);
  return ok(session.user);
}

/** Email + password sign-in. */
export async function login(input: LoginInput): Promise<Result<User>> {
  if (!LIVE.auth) {
    await mockDelay(null, 600);
    const user = userByEmail.get(input.email.trim().toLowerCase());
    if (!user || input.password !== DEMO_PASSWORD) {
      return { data: null, error: "errors.invalidCredentials" };
    }
    return ok(clone(user));
  }

  return attempt(async () => {
    const { data } = await getClient().mutate({
      mutation: LOGIN,
      variables: {
        input: { email: input.email, password: input.password, rememberMe: false },
      },
    });
    const result = fromPayload<AuthSessionData>(data?.login);
    return result.data ? completeSignIn(result.data) : result;
  });
}

/** Create an account and sign in. */
export async function register(input: RegisterInput): Promise<Result<User>> {
  if (!LIVE.auth) {
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

  return attempt(async () => {
    const { data } = await getClient().mutate({
      mutation: REGISTER,
      variables: {
        input: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          password: input.password,
          role: input.role,
          marketingOptIn: false,
        },
      },
    });
    const result = fromPayload<AuthSessionData>(data?.register);
    return result.data ? completeSignIn(result.data) : result;
  });
}

/** Request an OTP for a phone number. Always succeeds — no account enumeration. */
export async function requestOtp(phone: string): Promise<Result<{ phone: string }>> {
  if (!LIVE.auth) {
    await mockDelay(null, 500);
    return ok({ phone });
  }

  return attempt(async () => {
    const { data } = await getClient().mutate({
      mutation: REQUEST_OTP,
      variables: { input: { destination: phone, channel: "sms", purpose: "login" } },
    });
    const payload = data?.requestOtp;
    // The server normalises the number; echo its form back so a resend and the
    // verify call agree on what it was sent to.
    return payload?.success
      ? ok({ phone: (payload.data?.destination as string | undefined) ?? phone })
      : refuse<{ phone: string }>(payload?.error?.key);
  });
}

/** Verify an OTP. Signs in on success. */
export async function verifyOtp(input: OtpVerifyInput): Promise<Result<User>> {
  if (!LIVE.auth) {
    await mockDelay(null, 600);
    if (input.code !== DEMO_OTP) {
      return { data: null, error: "errors.invalidOtp" };
    }
    return ok(clone(users[0]));
  }

  return attempt(async () => {
    const { data } = await getClient().mutate({
      mutation: VERIFY_OTP,
      variables: {
        input: {
          destination: input.phone,
          code: input.code,
          channel: "sms",
          purpose: "login",
        },
      },
    });
    const result = fromPayload<AuthSessionData>(data?.verifyOtp);
    return result.data ? completeSignIn(result.data) : result;
  });
}

/**
 * Social sign-in.
 *
 * **Still mocked, and it refuses when the backend is live.** The API has no social
 * mutation yet — E2 shipped password and OTP — and signing a mock user in against a
 * real backend would produce the worst possible state: a signed-in header over an
 * app whose every query is unauthenticated. Refusing is the honest answer until
 * either the mutation exists or the buttons come off the sign-in screen.
 */
export async function socialLogin(
  provider: SocialProvider,
): Promise<Result<User>> {
  if (!LIVE.auth) {
    await mockDelay(provider, 700);
    return ok(clone(users[0]));
  }

  if (process.env.NODE_ENV === "development") {
    console.warn(
      `[auth] social sign-in (${provider}) has no backend mutation yet; refusing.`,
    );
  }
  return { data: null, error: "errors.generic" };
}

/** Start a password reset. Always returns ok — no account enumeration. */
export async function requestPasswordReset(
  email: string,
): Promise<Result<{ email: string }>> {
  if (!LIVE.auth) {
    await mockDelay(null, 600);
    return ok({ email });
  }

  return attempt(async () => {
    const { data } = await getClient().mutate({
      mutation: REQUEST_PASSWORD_RESET,
      variables: { email },
    });
    return data?.requestPasswordReset?.success
      ? ok({ email })
      : refuse<{ email: string }>(data?.requestPasswordReset?.error?.key);
  });
}

/**
 * Turn a persisted user back into a live session after a page load.
 *
 * The access token lives in memory, so a reload has a `user` in `localStorage` and
 * nothing to authenticate with. The refresh cookie survives the reload and this is
 * what spends it. Returns the account as the *server* currently describes it, which
 * is how a role change, a suspension or a permission grant reaches a tab that has
 * been open since before it happened.
 *
 * Resolves to an error for a signed-out visitor, which is not a failure — it is the
 * expected answer when there is no cookie.
 */
export async function restoreSession(): Promise<Result<User>> {
  if (!LIVE.auth) return { data: null, error: "errors.unauthenticated" };

  const session = await bootstrap();
  if (!session) return { data: null, error: "errors.unauthenticated" };
  return ok(session.user as User);
}

/**
 * Sign out: revoke the session server-side, drop the token, empty the cache.
 *
 * Called by `stores/auth.ts::signOut`, so every existing call site — the account
 * menu, the rider profile, the dashboard shells — keeps working untouched. The
 * cache clear matters: `InMemoryCache` keys by entity id, not by viewer, so the
 * next account would otherwise read the previous one's orders out of it.
 */
export async function signOutEverywhere(allDevices = false): Promise<void> {
  if (!LIVE.auth) return;

  if (allDevices && currentSession()) {
    // Only worth attempting with a live token — `logout` is authenticated. The
    // cookie route below is what actually ends *this* session either way.
    try {
      await getClient().mutate({ mutation: LOGOUT, variables: { allDevices } });
    } catch {
      // An expired token cannot revoke anything; `/auth/logout` can, and does.
    }
  }

  await revokeSession();
  clearSession();
  await resetClient();
}

/**
 * Demo accounts surfaced on the sign-in screen so reviewers can log straight in.
 *
 * Still read from `lib/mock/users.ts` while the backend is live, and deliberately:
 * the V1 seed (Unit 9) reproduces exactly these accounts and this password, so the
 * list stays correct either way. It becomes a server query when the seed exists.
 */
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
