/**
 * index.js — module 2, assembled.
 *
 * One `register` line in `routes/v1/index.js` mounts everything below, which is
 * the shape F1 §2 promised a module would have. What this file wires:
 *
 *  - `@fastify/cookie`, because the refresh credential is a cookie and nothing
 *    before this module needed one. Registered here rather than in `app.js` so
 *    the dependency belongs to the thing that uses it;
 *  - the repository over `fastify.prisma`, the service over the repository, the
 *    controller over the service;
 *  - **`fastify.requireUser`** — the guard every later module should use;
 *  - the routes, at `/auth` under whatever prefix the parent carries.
 *
 * ## Why the module owns its own mount path
 *
 * F1 §2 describes a module as "one `fastify.register(module, { prefix })` line".
 * This one is `fastify-plugin`-wrapped, because `requireUser` has to be visible
 * to the modules that come after it — and `fp` sets `skip-override`, which is
 * precisely the flag that makes Fastify *not* create the child context a
 * `prefix` option would attach to. Passing a prefix to an `fp` plugin silently
 * does nothing, which is the kind of bug that is found by wondering why every
 * auth route 404s. So the prefix is applied where it works: on the inner
 * `authRoutes` registration, from the constant below.
 *
 * ## `authenticate` vs `requireUser`
 *
 * `plugins/auth.js` already has `fastify.authenticate`, and it stays exactly as
 * it was: verify the signature, check `tokenType`, populate `request.user` from
 * the claims. It answers *"is this a valid, unexpired access token we issued?"*
 * and it answers it without touching the database.
 *
 * That is not enough to protect a route, and the gap is the fifteen minutes an
 * access token stays valid after the account behind it is suspended, deleted or
 * signed out. `requireUser` closes it by reading three things back:
 *
 *  1. the **account** — it exists, it is not soft-deleted, its status is not
 *     `suspended` or `banned`;
 *  2. the **session** — the `sessionId` claim names a row that is not revoked
 *     and has not expired, and belongs to this account. This is what makes
 *     "sign out" and "sign out everywhere" take effect immediately rather than
 *     at the next token expiry, and it is why STEP 6 says a session may not live
 *     only in memory;
 *  3. the **credential epoch** — `credentials.tokenEpoch` is bumped by every
 *     password change, so a token minted before a reset is refused even though
 *     its signature and expiry are both fine.
 *
 * It costs two indexed reads per request. That is the price of revocation being
 * real, and it is the right trade for an API where the alternative is a
 * suspended account continuing to place orders for a quarter of an hour.
 *
 * **Use `requireUser`.** `authenticate` remains for the rare route that wants
 * only the claims — and for `optionalAuth`, whose whole point is to not fail.
 */
import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import { unauthenticated } from "../../shared/errors/app-error.js";
import createRepository from "./repository.js";
import createService, { accountRefusal } from "./service.js";
import createController from "./controller.js";
import authRoutes from "./routes.js";

/** Where the endpoints live, under the caller's prefix — `/api/v1/auth`. */
export const AUTH_PREFIX = "/auth";

async function authModule(fastify) {
  if (!fastify.hasPlugin("@fastify/cookie")) {
    await fastify.register(cookie, {});
  }

  const repo = createRepository(fastify.prisma);
  const service = createService({ app: fastify, repo });
  const controller = createController({ service });

  /** Set by `requireUser`; declared so Fastify keeps the request object monomorphic. */
  fastify.decorateRequest("account", null);

  fastify.decorate("requireUser", async function requireUser(request) {
    await fastify.authenticate(request);

    const claims = request.user;
    if (!claims?.sub || !claims.sessionId) {
      throw unauthenticated("Access token does not identify a session");
    }

    const account = await repo.findByIdWithEpoch(claims.sub);
    if (!account || accountRefusal(account)) throw unauthenticated("Account cannot be used");

    if ((claims.epoch ?? 0) !== (account.credential?.tokenEpoch ?? 0)) {
      throw unauthenticated("Credentials changed since this token was issued");
    }

    const session = await repo.findSession(claims.sessionId);
    if (!session || session.userId !== account.id || session.revokedAt || session.expiresAt <= new Date()) {
      throw unauthenticated("Session is no longer valid");
    }

    // Evidence for the device list, not part of the request. Never awaited: a
    // failed bookkeeping write must not fail a correct request.
    repo.touchSession(session.id).catch((error) => request.log.warn({ err: error }, "could not touch session"));

    request.account = account;
  });

  await fastify.register(authRoutes, { prefix: AUTH_PREFIX, controller });
}

export default fp(authModule, { name: "auth-module", dependencies: ["prisma", "auth"] });
