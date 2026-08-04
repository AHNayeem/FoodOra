import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

import { appConfig, type AppConfig } from '../../config';
import { DomainError, ErrorCode } from '../errors';

/**
 * A request that will never finish should stop occupying a worker.
 *
 * Deliberately **not** applied to WebSocket subscriptions — a subscription is
 * long-lived by definition, and timing one out would be a bug rather than a
 * safeguard.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(@Inject(appConfig.KEY) private readonly app: AppConfig) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<'ws'>() === 'ws') return next.handle();

    return next.handle().pipe(
      timeout(this.app.requestTimeoutMs),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof TimeoutError
            ? new DomainError(ErrorCode.SERVICE_UNAVAILABLE, 'errors.timeout', {
                extensions: { timeoutMs: this.app.requestTimeoutMs },
              })
            : error,
        ),
      ),
    );
  }
}
