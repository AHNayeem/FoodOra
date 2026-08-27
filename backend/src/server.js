/**
 * server.js — start, and stop properly.
 *
 * The half that is easy to get wrong is the stop. A container runtime sends
 * `SIGTERM` and then waits; what it waits *for* is our choice. Three rules:
 *
 *  1. **Stop accepting, then finish.** `app.close()` closes the listener and
 *     runs `onClose` — which returns the Prisma pool — after in-flight requests
 *     resolve. Killing the process on the signal instead means every request in
 *     flight becomes a 502 the client sees.
 *  2. **A deadline, because "graceful" cannot mean "forever."** One slow query
 *     must not hold the deployment open, so `SHUTDOWN_TIMEOUT_MS` is a hard
 *     stop with exit code 1 — visible in a restart count rather than silent.
 *  3. **A second signal kills.** Somebody pressing Ctrl-C twice means it.
 *
 * `unhandledRejection` and `uncaughtException` are fatal here, deliberately.
 * After an uncaught throw the process is in an unknown state, and an API serving
 * from an unknown state is worse than one that restarted.
 */
import { buildApp } from "./app.js";
import env from "./config/env.js";

const app = await buildApp();

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    app.log.warn({ signal }, "second signal — exiting now");
    process.exit(1);
  }
  shuttingDown = true;
  app.log.info({ signal, timeoutMs: env.shutdownTimeoutMs }, "shutting down");

  const deadline = setTimeout(() => {
    app.log.error("shutdown timed out with requests still in flight — forcing exit");
    process.exit(1);
  }, env.shutdownTimeoutMs);
  deadline.unref();

  try {
    await app.close();
    clearTimeout(deadline);
    app.log.info("shutdown complete");
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "error during shutdown");
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void shutdown(signal));

process.on("unhandledRejection", (reason) => {
  app.log.fatal({ err: reason }, "unhandled rejection");
  void shutdown("unhandledRejection");
});

process.on("uncaughtException", (error) => {
  app.log.fatal({ err: error }, "uncaught exception");
  void shutdown("uncaughtException");
});

try {
  await app.listen({ port: env.port, host: env.host });
  app.log.info(
    { env: env.nodeEnv, apiPrefix: env.apiPrefix, pid: process.pid },
    `foodora-api listening on http://${env.host}:${env.port}`,
  );
} catch (error) {
  app.log.fatal({ err: error }, "failed to start");
  process.exit(1);
}
