/**
 * app.js — the application, assembled but not listening.
 *
 * Separated from `server.js` on purpose, and it is the separation the test suite
 * depends on: `buildApp()` returns a fully wired instance that has never bound a
 * port, so `app.inject()` exercises the real routing, the real validation, the
 * real error handler and the real database plugin without a socket. A test that
 * has to `listen()` first is a test that cannot run twice in parallel.
 *
 * Registration order is not arbitrary:
 *
 *  1. shared schemas, so a route may `$ref` them;
 *  2. `prisma`, because the health routes are decorated by it and boot should
 *     fail on an unreachable database rather than on the first request;
 *  3. security → cors → rate limit, outermost first: a rejected origin should
 *     never reach the rate limiter's counter, and neither should reach a route;
 *  4. `sensible` and `auth`, which only add decorators;
 *  5. routes.
 */
import Fastify from "fastify";
import env from "./config/env.js";
import authPlugin from "./plugins/auth.js";
import corsPlugin from "./plugins/cors.js";
import prismaPlugin from "./plugins/prisma.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import securityPlugin from "./plugins/security.js";
import sensiblePlugin from "./plugins/sensible.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import {
  attachRequestId,
  genReqId,
  loggerRedactions,
  loggerSerializers,
} from "./middleware/request-context.js";
import routes from "./routes/index.js";
import { SHARED_SCHEMAS } from "./shared/validators/schemas.js";

function loggerOptions() {
  if (env.logLevel === "silent") return false;
  return {
    level: env.logLevel,
    serializers: loggerSerializers,
    redact: { paths: loggerRedactions, censor: "[redacted]" },
    ...(env.logPretty
      ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss.l", ignore: "pid,hostname" } } }
      : {}),
  };
}

/**
 * @param {{ logger?: object|false, database?: boolean }} [overrides]
 *   `database: false` builds the app without the Prisma plugin — used by the one
 *   test that needs `checkDatabase` to fail without taking PostgreSQL down.
 */
export async function buildApp(overrides = {}) {
  const app = Fastify({
    logger: overrides.logger ?? loggerOptions(),
    genReqId,
    /** The proxy is the only thing that knows the real client address. Off unless told. */
    trustProxy: env.trustProxy,
    bodyLimit: env.bodyLimitBytes,
    /** `keepAliveTimeout` above the load balancer's avoids a race on idle sockets. */
    keepAliveTimeout: 72_000,
    ajv: {
      customOptions: {
        /**
         * `coerceTypes` because a query string has no types: `?page=2` is the
         * string "2" and every route would otherwise parse it by hand.
         * `removeAdditional` because a body is attacker-controlled and a field
         * nobody declared is a field nobody validated — dropping it is safer
         * than passing it to Prisma.
         */
        coerceTypes: "array",
        removeAdditional: "all",
        useDefaults: true,
        allErrors: true,
      },
    },
  });

  for (const schema of SHARED_SCHEMAS) app.addSchema(schema);

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.addHook("onSend", attachRequestId);

  if (overrides.database !== false) await app.register(prismaPlugin);
  await app.register(securityPlugin);
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(sensiblePlugin);
  await app.register(authPlugin);
  await app.register(routes);

  return app;
}

export default buildApp;
