import { HttpException, HttpStatus } from '@nestjs/common';

import {
  ConflictError,
  DomainError,
  ErrorCode,
  ForbiddenError,
  isDomainError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  UnauthenticatedError,
} from '../errors';

/**
 * Prisma errors arrive as `{ code: 'P2002', meta, clientVersion }`. Duck-typing
 * rather than importing the generated client keeps `common/` free of a
 * dependency on a build artifact.
 *
 * With one wrinkle that cost a real misclassification, found the first time an E2
 * endpoint touched a database that was not there. Only
 * `PrismaClientKnownRequestError` carries a code on `code`;
 * `PrismaClientInitializationError` — "can't reach database server" — puts it on
 * `errorCode`, **and leaves it `undefined`** for a plain connection refusal. So a
 * code-only match classified an unreachable Postgres as `INTERNAL_SERVER_ERROR` with a
 * stack trace, which is exactly backwards: a failover is not a bug in this process,
 * and the client's remedy is to retry rather than to report it.
 *
 * `retryable` is declared on that error and is `undefined` for a connection refusal
 * too, so the only signal actually present is the error's **class name**. Matching a
 * name is uncomfortable, and it is still the right trade here: the alternative is
 * importing the generated Prisma client into `common/`, which would make every
 * cross-cutting file depend on a build artifact — the thing this duck-typing exists to
 * avoid.
 */
interface PrismaLikeError {
  code?: string;
  errorCode?: string;
  retryable?: boolean;
  name?: string;
  meta?: Record<string, unknown>;
  clientVersion: string;
  message: string;
}

/** Prisma cannot reach or start against the database. Not a defect in this process. */
const INITIALISATION_ERROR = 'PrismaClientInitializationError';

function asPrismaError(error: unknown): PrismaLikeError | null {
  if (typeof error !== 'object' || error === null || !('clientVersion' in error)) return null;
  return error as PrismaLikeError;
}

function prismaCode(candidate: PrismaLikeError): string | null {
  const code = candidate.code ?? candidate.errorCode;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : null;
}

/**
 * Prisma's vocabulary, translated into the API's.
 *
 * The `meta` is deliberately dropped from anything the client sees: a unique
 * violation that names its constraint tells an attacker the shape of the table.
 * The original error is still logged in full server-side.
 */
function fromPrisma(error: unknown, code: string): DomainError {
  switch (code) {
    case 'P2002': // unique constraint
      return new ConflictError(undefined, 'errors.alreadyExists');
    case 'P2025': // required record not found
      return new NotFoundError('record');
    case 'P2003': // foreign key constraint
    case 'P2014': // relation violation
      return new DomainError(ErrorCode.BAD_USER_INPUT, 'errors.invalidReference');
    case 'P2034': // write conflict / deadlock — genuinely retryable
      return new ConflictError(undefined, 'errors.writeConflict');
    case 'P1001': // cannot reach database
    case 'P1002': // database timed out
    case 'P1017': // server closed the connection
      return new ServiceUnavailableError('database', error);
    case 'P2024': // connection pool timeout
      return new ServiceUnavailableError('database-pool', error);
    default:
      return new DomainError(ErrorCode.INTERNAL_SERVER_ERROR, 'errors.unexpected', { cause: error });
  }
}

/**
 * Nest's own exceptions — thrown by guards, the router, and validation — mapped
 * onto the same closed set of codes. A map rather than a switch because
 * `getStatus()` is a plain `number` while `HttpStatus` is an enum, and mixing
 * the two in a `case` is precisely the comparison `no-unsafe-enum-comparison`
 * exists to catch.
 */
const BY_HTTP_STATUS: Record<number, () => DomainError> = {
  [HttpStatus.UNAUTHORIZED]: () => new UnauthenticatedError(),
  [HttpStatus.FORBIDDEN]: () => new ForbiddenError(),
  [HttpStatus.NOT_FOUND]: () => new NotFoundError('route'),
  [HttpStatus.CONFLICT]: () => new ConflictError(),
  [HttpStatus.TOO_MANY_REQUESTS]: () => new RateLimitError(60),
  [HttpStatus.BAD_REQUEST]: () => new DomainError(ErrorCode.BAD_USER_INPUT, 'errors.invalidInput'),
  [HttpStatus.REQUEST_TIMEOUT]: () =>
    new DomainError(ErrorCode.SERVICE_UNAVAILABLE, 'errors.timeout'),
};

function fromHttpException(error: HttpException): DomainError {
  const status: number = error.getStatus();
  const known = BY_HTTP_STATUS[status];
  if (known) return known();

  return new DomainError(
    status >= 500 ? ErrorCode.INTERNAL_SERVER_ERROR : ErrorCode.BAD_USER_INPUT,
    'errors.unexpected',
    { cause: error },
  );
}

/**
 * Everything thrown anywhere becomes exactly one `DomainError` before it is
 * rendered. One translation table beats thirty `catch` blocks that each guess.
 */
export function translateError(error: unknown): DomainError {
  if (isDomainError(error)) return error;
  if (error instanceof HttpException) return fromHttpException(error);

  const prisma = asPrismaError(error);
  if (prisma) {
    const code = prismaCode(prisma);
    if (code) return fromPrisma(error, code);
    // No code to read: a connection refusal, a failover, an exhausted pool.
    // Retryable, and not the caller's fault.
    if (prisma.name === INITIALISATION_ERROR || prisma.retryable) {
      return new ServiceUnavailableError('database', error);
    }
  }

  return new DomainError(ErrorCode.INTERNAL_SERVER_ERROR, 'errors.unexpected', { cause: error });
}
