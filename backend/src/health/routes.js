/**
 * routes.js — liveness and readiness, which are different questions.
 *
 *  - **`GET /health`** — *is this process alive?* Answered from memory, with no
 *    dependency touched. A liveness probe that queries the database restarts the
 *    API every time PostgreSQL hiccups, which turns a recoverable outage into a
 *    restart loop.
 *  - **`GET /health/ready`** — *should traffic be sent here?* Answered by
 *    querying the database, and answered **503** when it cannot be. The
 *    instruction is explicit: do not pretend the service is ready if the
 *    database is unavailable. A ready check that always returns 200 is worse
 *    than no ready check, because the deploy that broke the connection string
 *    goes green.
 *
 * Both are also mounted under `/api/v1` — same handlers, one registration — so a
 * client that only knows the versioned prefix can still ask.
 *
 * **These two are the only routes outside the `{ success, data }` envelope**, and
 * the exception is deliberate: their readers are a load balancer, a container
 * orchestrator and a monitoring check, none of which will ever be taught to
 * unwrap `data`. What they read is the status code, and a flat body is what every
 * probe format expects. The 503 body *is* in the standard error shape, because
 * that one is also read by people.
 */
import { ERROR_CODES } from "../shared/constants/error-codes.js";
import env from "../config/env.js";

const liveSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        status: { type: "string" },
        uptimeSeconds: { type: "number" },
        version: { type: "string" },
        environment: { type: "string" },
        timestamp: { type: "string" },
      },
    },
  },
};

const readySchema = {
  response: {
    200: {
      type: "object",
      properties: {
        status: { type: "string" },
        checks: {
          type: "object",
          properties: {
            database: {
              type: "object",
              properties: {
                status: { type: "string" },
                latencyMs: { type: "number" },
                error: { type: "string" },
              },
            },
          },
        },
        timestamp: { type: "string" },
      },
    },
    503: { $ref: "error#" },
  },
};

export default async function healthRoutes(fastify) {
  fastify.get("/health", { schema: liveSchema, config: { rateLimit: false } }, async () => ({
    status: "ok",
    uptimeSeconds: Number(process.uptime().toFixed(3)),
    version: env.version,
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
  }));

  fastify.get("/health/ready", { schema: readySchema, config: { rateLimit: false } }, async (request, reply) => {
    const database = await fastify.checkDatabase();

    if (!database.ok) {
      return reply.status(503).send({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          key: ERROR_CODES.SERVICE_UNAVAILABLE.key,
          message: "Not ready: database unavailable",
          details: { database: { status: "down", error: database.error } },
          requestId: request.id,
        },
      });
    }

    return {
      status: "ready",
      checks: {
        database: { status: "up", latencyMs: Number(database.latencyMs.toFixed(2)) },
      },
      timestamp: new Date().toISOString(),
    };
  });
}
