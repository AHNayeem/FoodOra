import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SUPER_ADMIN_ROLE, type UserRole } from '../../shared/enums';
import { RequestContextService } from '../context';
import { ROLES_KEY } from '../decorators';
import { ForbiddenError, UnauthenticatedError } from '../errors';

/**
 * The coarse gate: does the actor hold one of the roles this handler is for?
 *
 * Roles answer "which app is this?" — a rider has no business in the merchant
 * order board whatever permissions they were granted — and `PermissionsGuard`
 * answers "may they do this particular thing?". Keeping the two separate is what
 * lets an operator hand a support agent one narrow permission without also
 * handing them a role's entire surface.
 *
 * `super-admin` passes every role check. That is not a shortcut: support work
 * means opening the merchant dashboard and the rider app, and the alternative —
 * granting an admin all fourteen roles — makes the assignment table lie about
 * who is what.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: RequestContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const actor = this.context.actor;
    if (!actor) throw new UnauthenticatedError();

    if (actor.roles.includes(SUPER_ADMIN_ROLE)) return true;
    if (required.some((role) => actor.roles.includes(role))) return true;

    // The required roles travel in `params` so the client can say *why* — "this
    // is the merchant app" — rather than showing a bare 403.
    throw new ForbiddenError('errors.forbidden', { requiredRoles: required });
  }
}
