/**
 * v1/index.js — the versioned API surface.
 *
 * Empty of domain routes, and that is the deliverable: the foundation phase
 * establishes where modules mount, not what they do. Each module from
 * BACKEND-REQUIREMENTS §3 lands here as one `fastify.register(module, { prefix })`
 * line and nothing else in this file changes.
 *
 * ## Why a prefix and not a header
 *
 * `/api/v1` is in the path because that is what the frontend is already built
 * against — `config/backend.ts` composes `API_URL` with a path — and because a
 * version in the path is visible in a log line, a browser address bar and a curl
 * command. A version negotiated through `Accept` is more correct and less
 * usable, and nothing here needs the correctness.
 *
 * ## What v2 would mean
 *
 * A new folder beside this one, mounted at `/api/v2`, sharing everything in
 * `shared/` and `plugins/`. The two run side by side until the frontend has
 * moved, which is the only reason to version a path at all.
 */
import healthRoutes from "../../health/routes.js";

export default async function v1Routes(fastify) {
  // Same handlers as the unprefixed pair — a client that only knows the
  // versioned base path can still ask whether the service is up.
  await fastify.register(healthRoutes);

  // ---------------------------------------------------------------------------
  // Modules mount here, in the order of BACKEND-REQUIREMENTS §3. Nothing is
  // registered yet, by instruction: the foundation phase builds the frame.
  //
  //   await fastify.register(authRoutes,    { prefix: "/auth" });
  //   await fastify.register(catalogRoutes, { prefix: "/catalog" });
  //   …
  // ---------------------------------------------------------------------------
}
