import type { GraphQLFormattedError } from 'graphql';

import { currentRequestContext } from '../common/context';
import { ErrorCode } from '../common/errors';

/**
 * The last gate before an error is serialised.
 *
 * `AllExceptionsFilter` has already turned whatever was thrown into a
 * `GraphQLError` with a stable `extensions.code`. This handles the errors that
 * never reach a filter — parse failures, validation rule violations, the
 * complexity plugin — and enforces the two production rules in one place:
 *
 * - **no stack traces, ever**, and no Prisma or Postgres text, because both
 *   describe the schema to whoever asked for it;
 * - **always a `requestId`**, because a generic message with nothing to quote
 *   makes a support ticket unanswerable.
 */
export function formatGraphQLError(isProduction: boolean) {
  return (formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError => {
    const extensions: Record<string, unknown> = { ...formatted.extensions };
    const requestId = currentRequestContext()?.requestId;

    // Apollo's own vocabulary, mapped onto ours so the frontend branches on one
    // closed set (D5 §Errors).
    const code = normaliseCode(extensions.code);
    const isInternal = code === ErrorCode.INTERNAL_SERVER_ERROR;

    delete extensions.stacktrace;
    if (requestId) extensions.requestId = requestId;
    extensions.code = code;

    if (isProduction && isInternal) {
      // Nothing from the original error survives — not the message, not the
      // path's shape, not the exception name.
      return { message: 'errors.unexpected', extensions: { code, requestId } };
    }

    if (!isProduction && isInternal && error instanceof Error) {
      extensions.originalMessage = error.message;
    }

    return { ...formatted, extensions };
  };
}

function normaliseCode(raw: unknown): string {
  if (typeof raw !== 'string') return ErrorCode.INTERNAL_SERVER_ERROR;
  switch (raw) {
    case 'GRAPHQL_PARSE_FAILED':
    case 'GRAPHQL_VALIDATION_FAILED':
    case 'BAD_REQUEST':
      return ErrorCode.BAD_USER_INPUT;
    case 'PERSISTED_QUERY_NOT_FOUND':
    case 'PERSISTED_QUERY_NOT_SUPPORTED':
      // Part of the APQ handshake, not an error the client should surface.
      return raw;
    default:
      return Object.values(ErrorCode).includes(raw as ErrorCode)
        ? raw
        : ErrorCode.INTERNAL_SERVER_ERROR;
  }
}
