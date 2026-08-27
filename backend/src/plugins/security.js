/**
 * security.js — the headers a JSON API should send, and the ones it should not.
 *
 * Helmet's defaults are written for a server that returns HTML. This API returns
 * JSON to a Next.js frontend on another origin, so two of them are turned off
 * rather than left on to be misread as protection:
 *
 *  - **CSP is off.** A Content-Security-Policy on a JSON response governs
 *    nothing — the policy that matters is the one the *frontend* sends with its
 *    HTML. Leaving Helmet's default on would put a strict-looking policy in
 *    every response header and secure nothing at all.
 *  - **`Cross-Origin-Resource-Policy` is `cross-origin`.** The frontend is a
 *    different origin by design; the default `same-origin` would block it.
 *
 * HSTS is left to the terminating proxy, which is the only thing that knows
 * whether TLS actually terminated there.
 */
import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import env from "../config/env.js";

async function securityPlugin(fastify) {
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    hsts: env.isProduction ? undefined : false,
  });

  /** Nothing this API returns should be cached by an intermediary by default. */
  fastify.addHook("onSend", async (request, reply, payload) => {
    if (!reply.hasHeader("cache-control")) reply.header("cache-control", "no-store");
    return payload;
  });
}

export default fp(securityPlugin, { name: "security" });
