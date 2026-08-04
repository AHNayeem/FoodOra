import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISSION_WILDCARD } from '../../shared/contracts';
import { RequestContextService } from '../context';
import { VENDOR_SCOPE_KEY } from '../decorators';
import { ForbiddenError, NotFoundError, UnauthenticatedError } from '../errors';
import { graphqlArgsOf, valueAtPath } from './execution-request';

/**
 * Refuses a call whose vendor argument is outside the actor's scope — the
 * `vendorId` on a `UserRoleAssignment` is what makes "manager of *this*
 * restaurant" expressible without a parallel permission system (D6 §RBAC).
 *
 * Opt-in via `@VendorScope('input.vendorId')`, because only the handler knows
 * where its vendor id is. Not registered globally for the same reason.
 *
 * **This is a cheap early gate, not the security boundary.** Row scoping lives in
 * the repository, so a scoped actor's list query returns their rows rather than
 * a page filtered after the fact. What this guard adds is the fast, explicit
 * refusal on a single-target mutation, and a `NOT_FOUND` rather than a
 * `FORBIDDEN` — answering "that isn't yours" with a 403 confirms the id exists.
 *
 * An actor with **no** vendor scope passes: a platform-wide finance manager or a
 * super-admin is unscoped by design, and it is their permissions that decide
 * whether they may act.
 */
@Injectable()
export class VendorScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: RequestContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const argPath = this.reflector.getAllAndOverride<string>(VENDOR_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!argPath) return true;

    const actor = this.context.actor;
    if (!actor) throw new UnauthenticatedError();

    const scope = actor.vendorIds ?? [];
    if (scope.length === 0) return true;
    if (actor.permissions.includes(PERMISSION_WILDCARD)) return true;

    const target = valueAtPath(graphqlArgsOf(context), argPath);
    if (typeof target !== 'string' || target.length === 0) {
      // The decorator names an argument the handler does not have. That is a
      // wiring bug, and failing closed is the only safe way to report it.
      throw new ForbiddenError('errors.forbidden');
    }

    if (!scope.includes(target)) throw new NotFoundError('vendor');
    return true;
  }
}
