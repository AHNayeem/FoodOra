/**
 * rate-limit.js — a global ceiling, in-process.
 *
 * Present because `TOO_MANY_REQUESTS` is in the error contract and a code the
 * API can never emit is a lie in a table. Generous by default: this is a
 * backstop against a runaway client, not the per-route throttling that sign-in
 * and OTP need — those get their own, much tighter, limits when the auth module
 * lands and can key them on the account rather than the address.
 *
 * **In-process, and therefore per-instance.** The store is memory; two instances
 * behind a load balancer each allow the full budget. A shared store would be
 * Redis, which is out of scope by instruction, so the honest reading of the
 * limit is "per instance" and the number should be set with that in mind.
 */
import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import env from "../config/env.js";
import { tooManyRequests } from "../shared/errors/app-error.js";

async function rateLimitPlugin(fastify) {
  if (!env.rateLimitEnabled) {
    fastify.log.info("rate limiting is disabled");
    return;
  }

  await fastify.register(rateLimit, {
    global: true,
    max: env.rateLimitMax,
    timeWindow: env.rateLimitWindowMs,
    // Health checks are what a probe does every few seconds; counting them means
    // the probe eventually rate-limits itself and reports the service as down.
    allowList: (request) => request.url.startsWith("/health"),
    keyGenerator: (request) => request.ip,
    /**
     * **This must return an `Error`, not a body.**
     *
     * The plugin `throw`s whatever comes back (`index.js`: `throw
     * params.errorResponseBuilder(...)`), so a plain object arrives at the error
     * handler with no `statusCode`, falls through every branch of
     * `normalizeError`, and is answered **500** — an API that says "internal
     * error" every time it rate-limits, which is both wrong and the opposite of
     * actionable. Returning an `AppError` gives the handler the 429, the code,
     * the i18n key and the request id, with no special case anywhere.
     */
    errorResponseBuilder: (_request, context) =>
      tooManyRequests(`Rate limit exceeded — retry in ${context.after}`, {
        details: { limit: context.max, retryAfterMs: context.ttl },
      }),
  });
}

export default fp(rateLimitPlugin, { name: "rate-limit" });
