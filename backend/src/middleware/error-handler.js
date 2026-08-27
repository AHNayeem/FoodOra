/**
 * error-handler.js — every failure, one shape.
 *
 * Four kinds of thing reach here, and each is translated once:
 *
 *  1. **`AppError`** — a route said what went wrong. Passed through.
 *  2. **A Fastify validation error** — Ajv refused the request against the
 *     route's schema. Becomes `BAD_USER_INPUT` with the offending fields in
 *     `details`, because "which field" is the only part of a 400 a client can
 *     act on.
 *  3. **A Prisma error** — a constraint the schema enforces, or a database that
 *     is not there. Mapped by code below.
 *  4. **Anything else** — a bug. Logged with its stack, and answered with
 *     `INTERNAL_ERROR` and nothing else. A stack trace in a response body is how
 *     an attacker learns the file layout, and a raw driver message is how they
 *     learn the column names.
 *
 * The rule the whole file exists to enforce: **the client never sees a message
 * we did not choose.** 4xx messages are ours and are safe to send; 5xx messages
 * are the runtime's and are not.
 */
import { Prisma } from "@foodora/database";
import env from "../config/env.js";
import { ERROR_CODES } from "../shared/constants/error-codes.js";
import { AppError, isAppError } from "../shared/errors/app-error.js";
import { fail } from "../shared/errors/envelope.js";

/**
 * Prisma's known request errors, in the terms of the error contract.
 *
 * Only the ones a well-written route can still hit are listed. The rest fall
 * through to `INTERNAL_ERROR`, which is the right answer for them: `P2021`
 * (table does not exist) is a deployment fault, not something a client sent.
 */
const PRISMA_CODES = {
  /** Unique constraint. The row is there and it is not yours to create again. */
  P2002: (error) =>
    new AppError("CONFLICT", "A record with these values already exists", {
      details: { fields: error.meta?.target },
    }),
  /** Foreign key. Something referenced does not exist — the client's mistake. */
  P2003: (error) =>
    new AppError("BAD_USER_INPUT", "Referenced record does not exist", {
      details: { field: error.meta?.field_name },
    }),
  /** Required relation violation. */
  P2014: () => new AppError("BAD_USER_INPUT", "That change would break a required relation"),
  /** `update`/`delete` matched nothing. */
  P2025: () => new AppError("NOT_FOUND", "Record not found"),
  /** Value too long for the column. */
  P2000: (error) =>
    new AppError("BAD_USER_INPUT", "A value is too long for its field", {
      details: { field: error.meta?.column_name },
    }),
  /** Serialisation failure / deadlock. Retryable, and therefore a conflict. */
  P2034: () => new AppError("CONFLICT", "The write conflicted with another transaction; retry"),
  /** Cannot reach the database server. */
  P1001: () => new AppError("SERVICE_UNAVAILABLE", "Database unreachable"),
  P1002: () => new AppError("SERVICE_UNAVAILABLE", "Database connection timed out"),
  P1008: () => new AppError("SERVICE_UNAVAILABLE", "Database operation timed out"),
  P1017: () => new AppError("SERVICE_UNAVAILABLE", "Database closed the connection"),
};

/** Ajv's `error.validation` array → `{ field, message }[]`. */
function validationDetails(error) {
  return (error.validation ?? []).map((issue) => ({
    field:
      issue.instancePath?.replace(/^\//, "").replace(/\//g, ".") ||
      issue.params?.missingProperty ||
      issue.params?.additionalProperty ||
      "(root)",
    rule: issue.keyword,
    message: issue.message,
  }));
}

/** Anything → an `AppError`. The one place that decision is made. */
export function normalizeError(error) {
  if (isAppError(error)) return error;

  if (error.validation) {
    const where = error.validationContext ?? "request";
    return new AppError("BAD_USER_INPUT", `Invalid ${where}`, { details: validationDetails(error) });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const map = PRISMA_CODES[error.code];
    if (map) return map(error);
    return new AppError("INTERNAL_ERROR", `Database error ${error.code}`, { cause: error });
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new AppError("SERVICE_UNAVAILABLE", "Database unavailable", { cause: error });
  }

  /**
   * A validation error from Prisma means the *server* built a malformed query —
   * a wrong field name, an enum identifier that does not exist. That is our bug,
   * so it is a 500 even though it reads like bad input.
   */
  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError("INTERNAL_ERROR", "Malformed database query", { cause: error });
  }

  // `@fastify/sensible`'s http-errors, and Fastify's own (413, 415, 400 on
  // unparseable JSON) already carry a status. Honour it; the code follows.
  if (typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
    const code =
      Object.keys(ERROR_CODES).find((name) => ERROR_CODES[name].status === error.statusCode) ?? "BAD_USER_INPUT";
    return new AppError(code, error.message);
  }

  return new AppError("INTERNAL_ERROR", "Internal server error", { cause: error });
}

export function errorHandler(error, request, reply) {
  const appError = normalizeError(error);
  const isServerFault = appError.statusCode >= 500;

  const log = isServerFault ? request.log.error.bind(request.log) : request.log.warn.bind(request.log);
  log(
    {
      err: isServerFault ? (appError.cause ?? appError) : undefined,
      code: appError.code,
      statusCode: appError.statusCode,
      route: request.routeOptions?.url ?? request.url,
      details: appError.details,
    },
    appError.message,
  );

  reply.status(appError.statusCode).send(
    fail({
      code: appError.code,
      key: appError.key,
      // A 5xx message is the runtime's, not ours. In development it is more
      // useful than harmful, so it is shown there and only there.
      message: appError.expose || env.isDevelopment ? appError.message : "Internal server error",
      details: appError.expose ? appError.details : undefined,
      requestId: request.id,
    }),
  );
}

/** Unmatched route. The same shape as everything else, so a 404 is not a special case. */
export function notFoundHandler(request, reply) {
  request.log.info({ url: request.url, method: request.method }, "no route");
  reply.status(404).send(
    fail({
      code: "NOT_FOUND",
      key: ERROR_CODES.NOT_FOUND.key,
      message: `Route ${request.method} ${request.url} not found`,
      requestId: request.id,
    }),
  );
}
