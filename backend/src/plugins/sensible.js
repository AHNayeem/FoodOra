/**
 * sensible.js — `@fastify/sensible`, for its utilities rather than its errors.
 *
 * What is used: `reply.vary`, `request.forwarded`, the `httpErrors` factory in
 * places that are genuinely HTTP-level (a 405 from the router).
 *
 * What is **not** used: `httpErrors` as the application's error type. Every
 * failure a route raises is an `AppError` from `shared/errors/app-error.js`,
 * because that carries the `code` and the i18n `key` the frontend needs and an
 * `httpError` carries neither. The error handler understands both, so a stray
 * `httpErrors.notFound()` still comes out in the right shape — it just arrives
 * with a generic key.
 */
import fp from "fastify-plugin";
import sensible from "@fastify/sensible";

async function sensiblePlugin(fastify) {
  await fastify.register(sensible);
}

export default fp(sensiblePlugin, { name: "sensible" });
