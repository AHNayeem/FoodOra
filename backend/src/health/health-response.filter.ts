import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/**
 * Health responses are a contract with the orchestrator, not with API clients.
 *
 * Terminus signals "not ready" by throwing a `ServiceUnavailableException`
 * whose body **is** the report — which check failed, with what detail. The
 * global `AllExceptionsFilter` would quite correctly normalise that into
 * `{ code: INTERNAL_SERVER_ERROR, key: "errors.unexpected" }`, and in doing so
 * throw away the only useful thing about it: an on-call engineer curling
 * `/health/ready` at 3am wants to know it was the migrations, not that
 * something went wrong.
 *
 * Controller-scoped filters take precedence over global ones, so this applies
 * to `/health/*` and nowhere else.
 */
@Catch(HttpException)
export class HealthResponseFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    void reply.status(exception.getStatus()).send(exception.getResponse());
  }
}
