/**
 * routes/index.js — the whole routing table, in one readable place.
 *
 * Two mount points, and the split is the operational one:
 *
 *  - **unversioned**, at the root: `/health` and `/health/ready`. Infrastructure
 *    reads these — a load balancer, a container orchestrator, a monitor — and
 *    none of them should have to know which API version is current. A probe URL
 *    that changes with a version bump is a probe that fails on deploy day.
 *  - **versioned**, under `API_PREFIX` (`/api/v1`): everything a client calls.
 */
import env from "../config/env.js";
import healthRoutes from "../health/routes.js";
import v1Routes from "./v1/index.js";

export default async function routes(fastify) {
  await fastify.register(healthRoutes);
  await fastify.register(v1Routes, { prefix: env.apiPrefix });

  /**
   * The root. Not decoration: hitting the bare origin is the first thing anyone
   * does with a new API, and "Cannot GET /" tells them nothing about whether
   * they have the right host or the right version.
   */
  fastify.get("/", { config: { rateLimit: false } }, async () => ({
    name: "foodora-api",
    version: env.version,
    apiPrefix: env.apiPrefix,
    health: "/health",
    ready: "/health/ready",
  }));
}
