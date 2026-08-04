/**
 * result.ts — the API's two failure shapes, folded into `Result<T>`.
 *
 * The backend distinguishes them deliberately (D5 §Payload types):
 *
 * - an **expected refusal** — wrong password, a spent code, an ineligible coupon —
 *   arrives as data at HTTP 200 in a `MutationPayload` whose `error.key` is an i18n
 *   key. `fromPayload` unwraps it;
 * - an **exception** — no token, forbidden, rate limited, the database is down —
 *   arrives as a GraphQL error with a closed-set `extensions.code`. `toErrorKey`
 *   turns it into an i18n key.
 *
 * Both end up as `Result<T>`, which every service in `services/` has returned since
 * Phase C. That is the whole point: a service body becomes a two-line map and no
 * component changes.
 */
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import type { Result } from "@/services/http";

/** The wire shape of `MutationPayload` and everything that implements it. */
export interface MutationPayloadLike<T> {
  success: boolean;
  error?: { key: string; path?: string | null } | null;
  data?: T | null;
}

/**
 * i18n keys the auth screens can render, as they exist in `messages/*.json`.
 *
 * A whitelist rather than a pass-through, because the API's vocabulary is larger
 * than any one screen's and rendering `errors.statusUnchanged` raw is worse than
 * rendering "something went wrong". Anything outside the set degrades to
 * `errors.generic` and, in development, says so in the console — which is how the
 * next cutover unit finds out it needs a translation rather than shipping without
 * one.
 */
const RENDERABLE = new Set([
  // form validation, shared with the client-side zod schemas
  "errors.emailRequired",
  "errors.emailInvalid",
  "errors.passwordRequired",
  "errors.passwordShort",
  "errors.nameRequired",
  "errors.phoneInvalid",
  "errors.termsRequired",
  // credentials
  "errors.invalidCredentials",
  "errors.wrongPassword",
  "errors.noPassword",
  "errors.emailTaken",
  "errors.phoneTaken",
  "errors.phoneMissing",
  "errors.accountNotFound",
  "errors.accountLocked",
  "errors.accountSuspended",
  // one-time codes
  "errors.invalidOtp",
  "errors.otpExpired",
  "errors.otpAttemptsExhausted",
  "errors.otpNotRequested",
  "errors.otpTooSoon",
  // password reset
  "errors.resetTokenInvalid",
  "errors.samePassword",
  // transport
  "errors.unauthenticated",
  "errors.forbidden",
  "errors.notFound",
  "errors.invalidInput",
  "errors.tooManyRequests",
  "errors.serviceUnavailable",
  "errors.network",
  "errors.generic",
]);

export const GENERIC_ERROR = "errors.generic";

export function renderableKey(key: string | null | undefined): string {
  if (key && RENDERABLE.has(key)) return key;
  if (process.env.NODE_ENV === "development" && key) {
    console.warn(
      `[graphql] no translation for "${key}" — falling back to ${GENERIC_ERROR}. ` +
        "Add it to messages/*.json and to RENDERABLE in lib/graphql/result.ts.",
    );
  }
  return GENERIC_ERROR;
}

/** The failing half of `Result<T>`, with the key run through the whitelist. */
export function refuse<T>(key: string | null | undefined): Result<T> {
  return { data: null, error: renderableKey(key) };
}

/** `MutationPayload` → `Result<T>`. */
export function fromPayload<T>(payload: MutationPayloadLike<T> | null | undefined): Result<T> {
  if (!payload) return { data: null, error: GENERIC_ERROR };
  if (!payload.success || payload.error || payload.data == null) {
    return { data: null, error: renderableKey(payload.error?.key) };
  }
  return { data: payload.data, error: null };
}

/** `extensions.code` → i18n key, for the errors that are thrown rather than returned. */
const BY_CODE: Record<string, string> = {
  UNAUTHENTICATED: "errors.unauthenticated",
  FORBIDDEN: "errors.forbidden",
  NOT_FOUND: "errors.notFound",
  BAD_USER_INPUT: "errors.invalidInput",
  TOO_MANY_REQUESTS: "errors.tooManyRequests",
  SERVICE_UNAVAILABLE: "errors.serviceUnavailable",
};

/**
 * Any thrown error → an i18n key.
 *
 * A `BAD_USER_INPUT` message is itself an i18n key (the server's zod messages are
 * the same keys the forms use), so it is preferred over the generic mapping when it
 * is one we can render — that is what puts "Password must be at least 8 characters"
 * on the screen instead of "Check your input".
 */
export function toErrorKey(error: unknown): string {
  if (CombinedGraphQLErrors.is(error)) {
    const first = error.errors[0];
    const code = first?.extensions?.code;
    if (typeof code === "string") {
      if (code === "BAD_USER_INPUT" && RENDERABLE.has(first.message)) return first.message;
      const mapped = BY_CODE[code];
      if (mapped) return mapped;
    }
    return renderableKey(first?.message);
  }
  // No response at all: API down, CORS, DNS, offline.
  return "errors.network";
}

/** Run a request, returning `Result<T>` instead of throwing. */
export async function attempt<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch (error) {
    return { data: null, error: toErrorKey(error) };
  }
}
