import { ErrorCode } from './error-codes';

/** A single field-level validation failure, shaped for `setError` on the client. */
export interface ValidationIssue {
  /** Dotted path into the input, e.g. `"input.address.postcode"`. */
  path: string;
  /** i18n key, never prose. */
  key: string;
  params?: Record<string, unknown>;
}

/**
 * The base of everything the API throws deliberately.
 *
 * A `DomainError` carries a **stable machine code** and an **i18n message key**
 * — never a sentence. The frontend already renders keys (its `Result` envelope
 * has done so since Phase C), so an error message can be translated into Bangla
 * or Arabic without the server knowing which locale asked.
 *
 * Thrown errors are for the *unexpected*. A refusal the product anticipates —
 * an ineligible coupon, a slot that just filled — is a `Result` failure carried
 * in a mutation payload with HTTP 200 (D5 §Payload types).
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly params?: Record<string, unknown>;
  /** Extra fields merged into `extensions` — `currentVersion`, `retryAfter`, `issues`. */
  readonly extensions: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    messageKey: string,
    options: {
      params?: Record<string, unknown>;
      extensions?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(messageKey, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.messageKey = messageKey;
    this.params = options.params;
    this.extensions = options.extensions ?? {};
    Error.captureStackTrace?.(this, new.target);
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(messageKey = 'errors.unauthenticated') {
    super(ErrorCode.UNAUTHENTICATED, messageKey);
  }
}

export class ForbiddenError extends DomainError {
  constructor(messageKey = 'errors.forbidden', params?: Record<string, unknown>) {
    super(ErrorCode.FORBIDDEN, messageKey, { params });
  }
}

export class NotFoundError extends DomainError {
  /**
   * `resource` is for the log, not for the client — telling an attacker which
   * table was missed is an existence oracle.
   */
  constructor(resource: string, messageKey = 'errors.notFound') {
    super(ErrorCode.NOT_FOUND, messageKey, { extensions: { resource } });
  }
}

export class ConflictError extends DomainError {
  constructor(currentVersion?: number, messageKey = 'errors.versionConflict') {
    super(ErrorCode.CONFLICT, messageKey, {
      extensions: currentVersion === undefined ? {} : { currentVersion },
    });
  }
}

export class ValidationError extends DomainError {
  constructor(
    public readonly issues: ValidationIssue[],
    messageKey = 'errors.invalidInput',
  ) {
    super(ErrorCode.BAD_USER_INPUT, messageKey, { extensions: { issues } });
  }
}

export class RateLimitError extends DomainError {
  constructor(retryAfterSeconds: number, messageKey = 'errors.tooManyRequests') {
    super(ErrorCode.TOO_MANY_REQUESTS, messageKey, {
      extensions: { retryAfter: retryAfterSeconds },
    });
  }
}

/** A dependency is down. Retryable, and not the caller's fault. */
export class ServiceUnavailableError extends DomainError {
  constructor(dependency: string, cause?: unknown) {
    super(ErrorCode.SERVICE_UNAVAILABLE, 'errors.serviceUnavailable', {
      extensions: { dependency },
      cause,
    });
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
