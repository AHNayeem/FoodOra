import { LIVE } from "@/config/backend";
import { DEMO_OTP } from "@/lib/mock";
import {
  issueChallenge,
  type VerificationChallenge,
  type VerificationChannel,
} from "@/lib/verification";
import { requestOtp, verifyOtp } from "./auth";
import { mockDelay, ok, type Result } from "./http";

/**
 * verification.ts — the seam a verification code goes through (Phase 17, G43).
 *
 * The abstraction the spec asks for, and the reason it is a *service* rather than
 * a component's business: sending a code and checking one are the two operations
 * a real provider owns, and they are the only two things that change when one
 * arrives. The rules around them — expiry, attempt limits, the resend cooldown —
 * are `lib/verification`'s and do not move.
 *
 * There are two bodies, exactly as `services/auth` has:
 *
 *  - **Mock.** The code is `DEMO_OTP`, the same one the sign-in screen already
 *    advertises, so a reviewer verifies an account with a number they have
 *    already been given. Nothing is "sent" anywhere.
 *  - **Live.** It delegates to the API's OTP pair through `services/auth`, which
 *    is where the mutation and the session live. Delegating rather than
 *    re-issuing the mutation is what keeps one client of that endpoint.
 *
 * Note what `confirm` does *not* do: sign anybody in. The live OTP mutation
 * returns a session because it is also a sign-in route; a customer verifying their
 * number is already signed in, and swapping their session out underneath them
 * would be a side effect nobody asked for. So the live path checks the code and
 * reports the answer, and the caller updates the account.
 */

export interface VerificationRequest {
  destination: string;
  channel?: VerificationChannel;
}

/**
 * Send a code and return the challenge it belongs to.
 *
 * Always succeeds for a well-formed destination, for the reason `requestOtp`
 * always succeeds: an endpoint that says "no account with that number" is an
 * account-enumeration oracle.
 */
export async function requestVerification(
  input: VerificationRequest,
): Promise<Result<VerificationChallenge>> {
  const destination = input.destination.trim();
  if (destination.length < 6) {
    return { data: null, error: "errors.destinationRequired" };
  }

  if (!LIVE.auth) {
    await mockDelay(null, 500);
    return ok(issueChallenge({ destination, channel: input.channel }));
  }

  const sent = await requestOtp(destination);
  if (sent.error || !sent.data) return { data: null, error: sent.error ?? "errors.generic" };
  return ok(issueChallenge({ destination: sent.data.phone, channel: input.channel }));
}

/**
 * Check a code against the challenge it was issued for.
 *
 * The *rules* (expired, locked, wrong) are `lib/verification`'s and are applied by
 * the store before this is called — this is only "is the code right", which is the
 * one part a provider owns.
 */
export async function confirmVerification(
  challenge: VerificationChallenge,
  code: string,
): Promise<Result<{ destination: string }>> {
  const cleaned = code.replace(/\D/g, "");

  if (!LIVE.auth) {
    await mockDelay(null, 500);
    return cleaned === DEMO_OTP
      ? ok({ destination: challenge.destination })
      : { data: null, error: "errors.invalidCode" };
  }

  const result = await verifyOtp({ phone: challenge.destination, code: cleaned });
  return result.data
    ? ok({ destination: challenge.destination })
    : { data: null, error: result.error ?? "errors.invalidCode" };
}

/** The code a reviewer should type in the prototype; null once live. */
export function demoVerificationCode(): string | null {
  return LIVE.auth ? null : DEMO_OTP;
}
