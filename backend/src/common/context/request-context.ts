import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

/** The authenticated actor, as far as everything downstream of the guard cares. */
export interface Actor {
  readonly id: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  /** Vendor / branch / rider scope, for row-level scoping in repositories. */
  readonly vendorIds?: readonly string[];
  readonly riderId?: string;
  readonly sessionId?: string;
}

/**
 * Everything about the current request that a service might need but should
 * never take as a parameter through six call frames.
 *
 * The region fields are the point (D1 §Multi-country): a query that buckets by
 * day, or looks up a tax rate, reads `timezone` and `countryCode` from here. No
 * service is allowed to assume Bangladesh, and none may call
 * `new Date().toISOString().slice(0, 10)`.
 */
export interface RequestContext {
  readonly requestId: string;
  readonly traceId?: string;
  readonly startedAt: number;
  actor?: Actor;
  readonly locale: string;
  readonly countryCode: string;
  readonly currency: string;
  readonly timezone: string;
  readonly ip?: string;
  readonly userAgent?: string;
  /** Per-request scratch space — DataLoader registry, memoised permission set. */
  readonly store: Map<string | symbol, unknown>;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Injectable so consumers depend on an interface rather than a module-level
 * singleton, which keeps them testable — a unit test provides a fake instead of
 * entering an ALS scope.
 */
@Injectable()
export class RequestContextService {
  /** Runs `fn` inside a fresh context. The GraphQL/HTTP middleware owns this. */
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
  }

  /** `undefined` outside a request — cron jobs and queue workers have no context. */
  get(): RequestContext | undefined {
    return storage.getStore();
  }

  /** For code that genuinely cannot proceed without one. */
  require(): RequestContext {
    const context = storage.getStore();
    if (!context) {
      throw new Error(
        'No RequestContext in scope. Wrap background work in RequestContextService.run() ' +
          'with a synthetic context, or read the value explicitly instead.',
      );
    }
    return context;
  }

  get requestId(): string | undefined {
    return storage.getStore()?.requestId;
  }

  get actor(): Actor | undefined {
    return storage.getStore()?.actor;
  }

  /** The auth guard attaches the actor once the token is verified. */
  setActor(actor: Actor): void {
    const context = storage.getStore();
    if (context) context.actor = actor;
  }
}

/** Escape hatch for framework glue (the Pino formatter) that cannot inject. */
export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
