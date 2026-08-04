import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { grantsAll } from '../../shared/contracts';
import { RequestContextService } from '../context';
import { PERMISSIONS_KEY } from '../decorators';
import { ForbiddenError, UnauthenticatedError } from '../errors';

/**
 * The fine gate (PBAC): every listed slug must be in the actor's **resolved**
 * set — role grants ∪ direct grants − direct denials, with a denial always
 * winning.
 *
 * Note "every", not "any". A handler that names two permissions is describing
 * two capabilities it needs, and satisfying half of them is not enough; a genuine
 * either/or belongs in two handlers or in one broader slug.
 *
 * The set comes from `AuthorizationStatePort`, never from the token, so a
 * permission revoked thirty seconds ago is already gone.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: RequestContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const actor = this.context.actor;
    if (!actor) throw new UnauthenticatedError();

    if (grantsAll(actor.permissions, required)) return true;

    throw new ForbiddenError('errors.forbidden', {
      // Only the ones they are missing — the full list would leak the shape of
      // the permission matrix to whoever probes an endpoint.
      requiredPermissions: required.filter((slug) => !actor.permissions.includes(slug)),
    });
  }
}
