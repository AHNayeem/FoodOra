import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import { appConfig, type AppConfig, ConfigModule, observabilityConfig, type ObservabilityConfig } from '../config';
import { currentRequestContext } from '../common/context';
import { REDACT_CENSOR, REDACT_PATHS } from './redaction';

/** The probes a Kubernetes node hits every few seconds. Logging them is noise. */
const SILENT_ROUTES = new Set(['/health/live', '/health/ready', '/metrics', '/favicon.ico']);

/**
 * Structured JSON logs, one line per request plus domain events, every line
 * carrying the `requestId` that correlates it with a trace, an audit row and
 * whatever the user is about to quote in a support ticket (D1 §Logging).
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [appConfig.KEY, observabilityConfig.KEY],
      useFactory: (app: AppConfig, observability: ObservabilityConfig) => ({
        pinoHttp: {
          level: observability.logLevel,
          redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },

          // Human-readable locally; JSON wherever a shipper is reading. Pretty
          // printing in production costs CPU and breaks structured queries.
          transport: observability.prettyLogs
            ? {
                target: 'pino-pretty',
                options: { colorize: true, singleLine: true, translateTime: 'HH:MM:ss.l' },
              }
            : undefined,

          base: { service: observability.serviceName, env: app.env },
          messageKey: 'message',
          timestamp: () => `,"time":"${new Date().toISOString()}"`,

          /**
           * One id for the whole request, whether the ingress supplied it or we
           * mint it. Written back onto the request headers so
           * `RequestContextMiddleware` converges on the same value regardless of
           * which middleware the framework runs first.
           */
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const existing = req.headers['x-request-id'];
            const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
            req.headers['x-request-id'] = id;
            res.setHeader('x-request-id', id);
            return id;
          },

          /** Every line gets the actor and locale, not just the request line. */
          customProps: () => {
            const context = currentRequestContext();
            if (!context) return {};
            return {
              requestId: context.requestId,
              traceId: context.traceId,
              actorId: context.actor?.id,
              locale: context.locale,
              countryCode: context.countryCode,
            };
          },

          autoLogging: {
            ignore: (req: IncomingMessage) => SILENT_ROUTES.has((req.url ?? '').split('?')[0] ?? ''),
          },

          /**
           * A 4xx is the API working correctly and telling the client something;
           * only a 5xx is a defect. Levelling them the same makes the error rate
           * alert meaningless.
           */
          customLogLevel: (_req, res, error) => {
            if (error || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },

          serializers: {
            req: (req: IncomingMessage & { id?: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
          },
        },
      }),
    }),
  ],
})
export class LoggerModule {}
