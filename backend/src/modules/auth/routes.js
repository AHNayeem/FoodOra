/**
 * routes.js — the nine endpoints, and the limits on them.
 *
 * Mounted by `routes/v1/index.js` at `${API_PREFIX}/auth`, so every path below
 * reads `/api/v1/auth/…` from outside.
 *
 * | Method | Path | Requires |
 * | --- | --- | --- |
 * | POST | `/register` | — |
 * | POST | `/login` | — |
 * | POST | `/otp/request` | — |
 * | POST | `/otp/verify` | — |
 * | POST | `/password/forgot` | — |
 * | POST | `/password/reset` | a reset token |
 * | POST | `/refresh` | the refresh cookie (+ CSRF header) or a body token |
 * | POST | `/logout` | the refresh cookie (+ CSRF header) or a bearer token |
 * | GET | `/me` | a bearer access token |
 *
 * **Nothing here is missing on purpose except social sign-in.** Google, Apple and
 * Facebook have a table (`social_identities`) and three buttons on the sign-in
 * screen, and `services/auth.socialLogin` already refuses when the backend is
 * live rather than pretending — there is no provider configuration in this repo
 * to verify a provider token against, so an endpoint here would be a stub that
 * either trusts the client's claim about who it is (an authentication bypass) or
 * always fails. The buttons stay honest; see M2 §Remaining gaps.
 *
 * ## The tighter rate limit
 *
 * The global limiter is a 300/minute backstop against a runaway client. The six
 * unauthenticated endpoints below get `AUTH_RATE_MAX` (10/minute) per address
 * instead, because they are the ones worth guessing at: a password, a six-digit
 * code, a reset token. In-process and therefore per-instance, as
 * `plugins/rate-limit.js` says — which is the honest limit of a prototype with
 * no shared store, and the reason the *durable* brute-force defence is the
 * per-credential lockout in `credentials.failedCount` / `lockedUntil` rather
 * than this.
 */
import env from "../../config/env.js";
import { ROUTE_SCHEMAS } from "./schemas.js";

/** Per-address, per-route. Ignored entirely when `RATE_LIMIT_ENABLED=false`. */
const throttled = { rateLimit: { max: env.authRateMax, timeWindow: env.authRateWindowMs } };

export default async function authRoutes(fastify, { controller }) {
  fastify.post("/register", { schema: ROUTE_SCHEMAS.register, config: throttled }, controller.register);
  fastify.post("/login", { schema: ROUTE_SCHEMAS.login, config: throttled }, controller.login);

  fastify.post("/otp/request", { schema: ROUTE_SCHEMAS.requestOtp, config: throttled }, controller.requestOtp);
  fastify.post("/otp/verify", { schema: ROUTE_SCHEMAS.verifyOtp, config: throttled }, controller.verifyOtp);

  fastify.post("/password/forgot", { schema: ROUTE_SCHEMAS.forgotPassword, config: throttled }, controller.forgotPassword);
  fastify.post("/password/reset", { schema: ROUTE_SCHEMAS.resetPassword, config: throttled }, controller.resetPassword);

  /**
   * Not throttled at the tight rate.
   *
   * A refresh is what an ordinary session does every fifteen minutes, and a
   * browser with several tabs open can legitimately produce a burst of them. The
   * thing that makes guessing a refresh token pointless is that it is 256 bits
   * of `randomBytes`, not a rate limit; the global backstop still applies.
   */
  fastify.post("/refresh", { schema: ROUTE_SCHEMAS.refresh }, controller.refresh);

  fastify.post("/logout", { schema: ROUTE_SCHEMAS.logout }, controller.logout);

  fastify.get("/me", { schema: ROUTE_SCHEMAS.me, preHandler: fastify.requireUser }, controller.me);
}
