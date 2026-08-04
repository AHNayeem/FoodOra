import type { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * One way to reach the request whichever transport the handler arrived on.
 *
 * A guard cannot use `context.switchToHttp()` on a GraphQL operation — it
 * returns an empty shell — and a resolver has no `req` unless the driver's
 * `context` factory put one there, which `graphql.module.ts` does. Getting this
 * wrong is silent: the guard reads `undefined` headers and refuses every
 * request, or worse, allows them.
 */

interface GraphqlContext {
  req?: FastifyRequest;
  reply?: FastifyReply;
}

export function requestOf(context: ExecutionContext): FastifyRequest | undefined {
  if (context.getType<'graphql'>() === 'graphql') {
    return GqlExecutionContext.create(context).getContext<GraphqlContext>().req;
  }
  return context.switchToHttp().getRequest<FastifyRequest | undefined>();
}

export function replyOf(context: ExecutionContext): FastifyReply | undefined {
  if (context.getType<'graphql'>() === 'graphql') {
    return GqlExecutionContext.create(context).getContext<GraphqlContext>().reply;
  }
  return context.switchToHttp().getResponse<FastifyReply | undefined>();
}

/**
 * Is this the *root* field of an operation, rather than a nested field resolver?
 *
 * `fieldResolverEnhancers: ['guards']` runs every guard again for each resolved
 * field, and the two cases need opposite defaults: a nested field inherits its
 * operation's verdict, while a second root field in the same document — a
 * document may mix a public query with a private one — has to be judged on its
 * own. GraphQL's `info.path.prev` is exactly that distinction, and it is only
 * `undefined` at the root. Non-GraphQL transports have no nesting.
 */
export function isRootField(context: ExecutionContext): boolean {
  if (context.getType<'graphql'>() !== 'graphql') return true;
  const info = GqlExecutionContext.create(context).getInfo<
    { path?: { prev?: unknown } } | undefined
  >();
  return info?.path?.prev === undefined;
}

/** Resolver arguments, for the guards that read an id out of them. */
export function graphqlArgsOf(context: ExecutionContext): Record<string, unknown> | undefined {
  if (context.getType<'graphql'>() !== 'graphql') return undefined;
  return GqlExecutionContext.create(context).getArgs<Record<string, unknown>>();
}

/** `"input.vendorId"` → the value, or `undefined` if any hop is missing. */
export function valueAtPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

/** `Authorization: Bearer <token>` → the token, case-insensitively. */
export function bearerTokenOf(request: FastifyRequest | undefined): string | undefined {
  const header = request?.headers.authorization;
  if (typeof header !== 'string') return undefined;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer') return undefined;
  const token = rest.join('');
  return token.length > 0 ? token : undefined;
}
