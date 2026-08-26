import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  type ActorAuthorization,
  AUTHORIZATION_STATE,
  type AuthorizationStatePort,
  TOKEN_VERIFIER,
  type TokenVerifierPort,
} from '../../shared/contracts';
import { canHoldSession } from '../../shared/enums';
import { type Actor, RequestContextService } from '../context';
import { FRESH_SESSION_KEY, PUBLIC_KEY } from '../decorators';
import { ForbiddenError, UnauthenticatedError } from '../errors';
import { bearerTokenOf, isRootField, requestOf } from './execution-request';

/** Memoised per request, because a GraphQL operation runs guards per field. */
const EVALUATION = Symbol('auth:evaluation');

type Evaluation =
  | { kind: 'anonymous' }
  | { kind: 'actor'; actor: Actor; sessionId: string };

/**
 * Turns a bearer token into an actor on the request context — and refuses the
 * request if it cannot.
 *
 * Registered **globally** (in `AuthModule`), so the default for a new handler is
 * "authentication required" and `@Public()` is the deliberate opt-out. D5's
 * example lists the guard in `@UseGuards(…)` on each mutation; making it global
 * inverts the failure mode, which is the point: forgetting a decorator should
 * lock a door, not leave one open.
 *
 * Three checks, in increasing cost:
 *
 * 1. **Signature** — RS256 against the current or previous key. No I/O.
 * 2. **Epoch** — the token's `epoch` against the user's current one, from a
 *    Redis entry that is *deleted* on a password change rather than expiring.
 *    This is what makes a stateless token revocable inside one request.
 * 3. **Session revocation** — a Redis read, and only for handlers marked
 *    `@FreshSession()`. Paying it on every menu read to close a 15-minute
 *    window on a menu read is not a trade worth making.
 *
 * Note what is *not* trusted: the token's `role` and `permHash` are never used
 * for authorization. The permission set is resolved server-side on every
 * request, so revoking a role takes effect on the next call rather than on the
 * next token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: RequestContextService,
    @Inject(TOKEN_VERIFIER) private readonly tokens: TokenVerifierPort,
    @Inject(AUTHORIZATION_STATE) private readonly state: AuthorizationStatePort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    const evaluation = await this.evaluateOnce(context, isPublic);

    if (evaluation.kind === 'anonymous') {
      if (isPublic) return true;
      // A *nested* field inherits its operation's verdict: the root query was
      // public and nobody signed in, so a field below it must not now demand a
      // token. What it may still demand is a permission, which is
      // `PermissionsGuard`'s job and fails correctly against no actor.
      //
      // A second *root* field is a different matter — one document may ask for a
      // public list and a private `me` at once, and the private one has to be
      // refused on its own terms.
      if (!isRootField(context)) return true;
      throw new UnauthenticatedError();
    }

    if (this.reflector.getAllAndOverride<boolean>(FRESH_SESSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])) {
      if (await this.state.isSessionRevoked(evaluation.sessionId)) {
        throw new UnauthenticatedError('errors.sessionExpired');
      }
    }

    return true;
  }

  /**
   * `fieldResolverEnhancers: ['guards']` means this runs for every resolved
   * field, not once per operation. Verifying the same token forty times for one
   * query is pure waste, so the verdict is cached in the request context's
   * scratch space — the reason that `Map` exists.
   */
  private async evaluateOnce(context: ExecutionContext, isPublic: boolean): Promise<Evaluation> {
    const requestContext = this.context.get();
    const cached = requestContext?.store.get(EVALUATION) as Evaluation | undefined;
    if (cached) return cached;

    const evaluation = await this.evaluate(context, isPublic);
    requestContext?.store.set(EVALUATION, evaluation);
    if (evaluation.kind === 'actor') this.context.setActor(evaluation.actor);
    return evaluation;
  }

  private async evaluate(context: ExecutionContext, isPublic: boolean): Promise<Evaluation> {
    const token = bearerTokenOf(requestOf(context));

    // A public operation with a token still gets an actor — that is how a
    // personalised public list (`vendors`, `offers`) knows who is asking.
    if (!token) {
      if (isPublic) return { kind: 'anonymous' };
      throw new UnauthenticatedError();
    }

    // A *broken* token is an error even on a public operation: the client needs to
    // learn that it must refresh, and quietly downgrading it would hide an expired
    // session behind a page that renders as though nobody was signed in. This check
    // is local — a signature and two claims — so it costs nothing and cannot fail for
    // infrastructural reasons.
    const claims = await this.tokens.verifyAccessToken(token);

    /**
     * From here on the checks need Postgres and Redis, and that changes what a
     * failure means.
     *
     * On a **public** operation the actor is an enhancement — a personalised vendor
     * list, a status page that greets you — so if authorization cannot be resolved,
     * the honest degradation is anonymous rather than an error. The alternative was
     * discovered the hard way: with the database down, `apiStatus` — the query whose
     * entire job is to report that the database is down — failed with
     * `SERVICE_UNAVAILABLE` for every signed-in caller.
     *
     * On a **protected** operation the same failure has to propagate. There the actor
     * is not an enhancement, and "we could not determine your permissions" must never
     * resolve to "carry on".
     */
    let authorization: ActorAuthorization | null;
    let currentEpoch: number;
    try {
      authorization = await this.state.authorizationFor(claims.sub);
      if (!authorization) {
        if (isPublic) return { kind: 'anonymous' };
        throw new UnauthenticatedError();
      }
      currentEpoch = await this.state.currentEpoch(claims.sub);
    } catch (error) {
      if (isPublic && !(error instanceof UnauthenticatedError)) return { kind: 'anonymous' };
      throw error;
    }

    if (!canHoldSession(authorization.status)) {
      throw new ForbiddenError('errors.accountSuspended');
    }

    if (claims.epoch !== currentEpoch) {
      // The password changed, or every session was revoked. Same key as an
      // expiry, because to the client the remedy is identical: sign in again.
      throw new UnauthenticatedError('errors.sessionExpired');
    }

    return {
      kind: 'actor',
      sessionId: claims.sid,
      actor: toActor(claims.sid, authorization),
    };
  }
}

function toActor(sessionId: string, authorization: ActorAuthorization): Actor {
  return {
    id: authorization.userId,
    roles: authorization.roles,
    permissions: authorization.permissions,
    vendorIds: authorization.vendorIds,
    sessionId,
  };
}
