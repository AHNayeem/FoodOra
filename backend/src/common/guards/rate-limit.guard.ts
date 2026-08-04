import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { graphqlConfig, type GraphqlConfig } from '../../config';
import { RATE_LIMITER, type RateLimiterPort } from '../../shared/contracts';
import { RequestContextService } from '../context';
import { RATE_LIMIT_KEY, type RateLimitRule } from '../decorators';
import { RateLimitError } from '../errors';
import { bearerTokenOf, requestOf } from './execution-request';

/** Counted once per request, not once per resolved field. */
const COUNTED = Symbol('rateLimit:counted');

/**
 * The coarse volume limit, first in the chain so an unauthenticated flood is
 * refused before it reaches token verification (D6 §Guards).
 *
 * Two deliberate limits on what this can do:
 *
 * **It keys on IP, and picks the budget from the mere presence of an
 * `Authorization` header** — 300/min if one is there, 60/min if not — because it
 * runs before the token is verified and therefore does not know who is asking.
 * Someone sending a garbage bearer gets the authenticated budget from a single
 * IP: a 5× loosening, still bounded, and the requests it buys fail at signature
 * verification, which costs a fraction of a millisecond and no I/O. Reordering to
 * learn the identity first would mean verifying tokens for traffic we intend to
 * drop, which is the thing being avoided.
 *
 * **It counts a request, not a field.** A GraphQL document with ten root fields
 * is one hit; breadth is the complexity plugin's job, and double-charging for it
 * here would make two budgets that have to agree.
 *
 * Limits that key on something in the payload — an email, a phone number — cannot
 * live in a guard at all, because only the service knows the destination. Those
 * are in `modules/auth/domain/policies/rate-limits.ts`, applied where the value
 * is known.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: RequestContextService,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiterPort,
    @Inject(graphqlConfig.KEY) private readonly config: GraphqlConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requestContext = this.context.get();
    const override = this.reflector.getAllAndOverride<RateLimitRule>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // One bucket per rule per request: an explicitly limited handler is charged
    // on its own budget as well as being covered by the request-wide one.
    const countedKey = override ? `${COUNTED.toString()}:${override.name}` : COUNTED;
    if (requestContext?.store.has(countedKey)) return true;
    requestContext?.store.set(countedKey, true);

    const ip = requestContext?.ip ?? 'unknown';
    const rule = override ?? this.defaultRule(context);
    const verdict = await this.limiter.consume(
      `${rule.name}:${ip}`,
      rule.limit,
      rule.windowSeconds,
    );

    if (!verdict.allowed) throw new RateLimitError(verdict.retryAfterSeconds);
    return true;
  }

  private defaultRule(context: ExecutionContext): RateLimitRule {
    const authenticated = bearerTokenOf(requestOf(context)) !== undefined;
    return {
      name: authenticated ? 'req:auth' : 'req:anon',
      limit: authenticated ? this.config.rateLimit.authenticated : this.config.rateLimit.anonymous,
      windowSeconds: 60,
    };
  }
}
