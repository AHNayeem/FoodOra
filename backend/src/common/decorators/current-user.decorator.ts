import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { type Actor, currentRequestContext } from '../context';

/**
 * `@CurrentUser() actor: Actor` in a resolver.
 *
 * Reads the actor off the request context rather than off `req.user`, so the
 * same value is visible to a service six frames down without being threaded
 * through as a parameter — and so it works identically under HTTP, GraphQL and
 * a WebSocket subscription, which do not share a request object.
 *
 * Returns `undefined` on a public operation. E2's `JwtAuthGuard` is what
 * guarantees it is populated everywhere else.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, _context: ExecutionContext): Actor | undefined => currentRequestContext()?.actor,
);
