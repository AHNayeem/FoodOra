import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Inject,
  Logger,
} from '@nestjs/common';
import { GqlArgumentsHost } from '@nestjs/graphql';
import type { FastifyReply } from 'fastify';
import { GraphQLError } from 'graphql';

import { appConfig, type AppConfig } from '../../config';
import { currentRequestContext } from '../context';
import { type DomainError, ErrorCode, HTTP_STATUS_BY_CODE } from '../errors';
import { translateError } from './error-translator';

/**
 * The last thing that runs before an error leaves the process.
 *
 * Two surfaces, one policy (D5 §Errors): a GraphQL operation gets a
 * `GraphQLError` with a stable `extensions.code`; a REST route — health,
 * webhooks, uploads — gets the JSON body its caller expects. Both carry the
 * `requestId`, and neither carries a stack trace or Prisma's error text in
 * production, because those describe the schema to whoever asked.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  constructor(@Inject(appConfig.KEY) private readonly app: AppConfig) {}

  catch(exception: unknown, host: ArgumentsHost): GraphQLError | void {
    const error = translateError(exception);
    const requestId = currentRequestContext()?.requestId;

    this.log(error, exception, requestId);

    if (host.getType<'graphql'>() === 'graphql') {
      return this.toGraphQLError(error, requestId, GqlArgumentsHost.create(host));
    }
    this.sendHttp(error, requestId, host);
  }

  /**
   * A 5xx is a defect and gets the original throwable with its stack; a 4xx is
   * the client being told something and is noise at anything above `debug`.
   */
  private log(error: DomainError, original: unknown, requestId?: string): void {
    const status = HTTP_STATUS_BY_CODE[error.code];
    const meta = { requestId, code: error.code, key: error.messageKey };

    if (status >= 500) {
      this.logger.error(meta, original instanceof Error ? original.stack : String(original));
    } else {
      this.logger.debug(meta, error.messageKey);
    }
  }

  private toGraphQLError(
    error: DomainError,
    requestId: string | undefined,
    gqlHost: GqlArgumentsHost,
  ): GraphQLError {
    const isInternal = error.code === ErrorCode.INTERNAL_SERVER_ERROR;
    const info = gqlHost.getInfo<{ fieldName?: string } | undefined>();

    return new GraphQLError(
      // The message is an i18n key the client already knows how to render —
      // except for a genuine bug, where the only honest thing to return is a
      // generic key plus the id support will ask for.
      isInternal ? 'errors.unexpected' : error.messageKey,
      {
        extensions: {
          code: error.code,
          requestId,
          field: info?.fieldName,
          ...(error.params ? { params: error.params } : {}),
          ...(isInternal && this.app.isProduction ? {} : error.extensions),
        },
      },
    );
  }

  private sendHttp(error: DomainError, requestId: string | undefined, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = HTTP_STATUS_BY_CODE[error.code];
    const isInternal = error.code === ErrorCode.INTERNAL_SERVER_ERROR;

    void reply.status(status).send({
      statusCode: status,
      code: error.code,
      key: isInternal ? 'errors.unexpected' : error.messageKey,
      requestId,
      ...(isInternal && this.app.isProduction ? {} : error.extensions),
    });
  }
}
