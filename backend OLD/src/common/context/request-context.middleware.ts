import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';

import { appConfig, type AppConfig } from '../../config';
import { type RequestContext, RequestContextService } from './request-context';

/** Header name is lowercase because Node normalises them. */
const REQUEST_ID_HEADER = 'x-request-id';
const TRACE_HEADER = 'traceparent';

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parses `Accept-Language: bn-BD,bn;q=0.9,en;q=0.8` down to its highest-weighted
 * base tag. Deliberately small — full BCP-47 negotiation is `regions`' job in
 * E3; all this needs to do is pick a sane default before the actor is known.
 */
function preferredLocale(raw: string | undefined, supported: string): string {
  if (!raw) return supported;
  const best = raw
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split('=')[1]) : 1 };
    })
    .filter((entry) => entry.tag && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q)[0];
  return best ? (best.tag.split('-')[0] ?? supported) : supported;
}

/**
 * Opens the `AsyncLocalStorage` scope every request runs inside.
 *
 * This is middleware rather than an interceptor on purpose: middleware runs
 * before guards, so an authentication failure is still logged with a
 * `requestId`, and a GraphQL request gets one context for the whole operation
 * rather than one per resolver.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly context: RequestContextService,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
  ) {}

  use(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    // Honour an id from the ingress so one request has one id end to end;
    // mint one when we are the entry point. Written back onto the headers so
    // pino's `genReqId` converges on the same value whichever middleware the
    // framework happens to run first.
    const requestId = header(req, REQUEST_ID_HEADER) ?? randomUUID();
    req.headers[REQUEST_ID_HEADER] = requestId;
    const defaults = this.app.defaults;

    const context: RequestContext = {
      requestId,
      traceId: header(req, TRACE_HEADER)?.split('-')[1],
      startedAt: Date.now(),
      locale: preferredLocale(header(req, 'accept-language'), defaults.locale),
      countryCode: (header(req, 'x-country-code') ?? defaults.countryCode).toUpperCase(),
      currency: (header(req, 'x-currency') ?? defaults.currency).toUpperCase(),
      timezone: header(req, 'x-timezone') ?? defaults.timezone,
      // Nginx sets the real client IP; without it, rate limits and audit rows
      // would all be attributed to the load balancer (D10 §Nginx).
      ip: header(req, 'x-forwarded-for')?.split(',')[0]?.trim() ?? req.socket?.remoteAddress,
      userAgent: header(req, 'user-agent'),
      store: new Map(),
    };

    // Echo it back: `requestId` is what support asks for when a user reports
    // an error, and the generic 500 message carries nothing else.
    res.setHeader(REQUEST_ID_HEADER, requestId);

    this.context.run(context, next);
  }
}
