/**
 * cors.js — which browsers may call this API.
 *
 * An allow-list from `CORS_ORIGINS`, not a wildcard, because the session will
 * live in a cookie: `credentials: true` and `Access-Control-Allow-Origin: *` are
 * mutually exclusive by specification, so a wildcard now would have to be undone
 * the day authentication lands. `*` is still accepted as a *development*
 * convenience and echoes the caller's origin rather than sending the wildcard.
 */
import fp from "fastify-plugin";
import cors from "@fastify/cors";
import env from "../config/env.js";

async function corsPlugin(fastify) {
  const allowAll = env.corsOrigins.includes("*");
  if (allowAll && env.isProduction) {
    fastify.log.warn("CORS_ORIGINS contains '*' in production — every origin may call this API with credentials");
  }

  await fastify.register(cors, {
    origin: allowAll ? true : env.corsOrigins,
    credentials: env.corsCredentials,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    // `x-request-id` so a caller can correlate its own log line with ours.
    allowedHeaders: ["Content-Type", "Authorization", "Accept-Language", "x-request-id", "Idempotency-Key"],
    exposedHeaders: ["x-request-id"],
    maxAge: 600,
  });
}

export default fp(corsPlugin, { name: "cors" });
