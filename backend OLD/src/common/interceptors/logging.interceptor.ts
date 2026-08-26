import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { currentRequestContext } from '../context';

/** Above this, an operation is worth someone looking at. Matches the p95 alert. */
const SLOW_OPERATION_MS = 400;

/**
 * pino-http already logs one line per HTTP request — but every GraphQL call is
 * the same `POST /graphql`, so that line says nothing about what the client
 * actually asked for. This adds the operation, and only for root fields:
 * logging every `@ResolveField` would turn one page load into two hundred lines.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('GraphQL');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<'graphql'>() !== 'graphql') return next.handle();

    const gql = GqlExecutionContext.create(context);
    const info = gql.getInfo<{
      parentType: { name: string };
      fieldName: string;
      operation: { operation: string };
    }>();

    // Root fields only — `Query`, `Mutation`, `Subscription`.
    if (!['Query', 'Mutation', 'Subscription'].includes(info.parentType.name)) {
      return next.handle();
    }

    const startedAt = process.hrtime.bigint();
    const requestContext = currentRequestContext();

    return next.handle().pipe(
      tap({
        next: () => this.record(info, startedAt, requestContext?.requestId, requestContext?.actor?.id),
        error: () =>
          this.record(info, startedAt, requestContext?.requestId, requestContext?.actor?.id, true),
      }),
    );
  }

  private record(
    info: { parentType: { name: string }; fieldName: string },
    startedAt: bigint,
    requestId?: string,
    actorId?: string,
    failed = false,
  ): void {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const payload = {
      requestId,
      actorId,
      operation: `${info.parentType.name}.${info.fieldName}`,
      durationMs: Math.round(durationMs * 100) / 100,
      failed,
    };

    if (durationMs >= SLOW_OPERATION_MS) {
      this.logger.warn(payload, 'slow operation');
    } else {
      this.logger.debug(payload);
    }
  }
}
