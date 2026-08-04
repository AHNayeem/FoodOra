import { Injectable, Logger } from '@nestjs/common';

import { currentRequestContext } from '../../../common/context';
import { IdService } from '../../../common/ids';
import { TransactionManager } from '../../../infrastructure/prisma';
import type { AuthAuditEvent, AuthAuditPort } from '../domain';

/**
 * Writes the security-relevant events to `AuditLog`.
 *
 * Two decisions worth stating:
 *
 * **It never throws.** An audit write failing must not turn a successful password
 * change into an error — the user's password *has* changed, and reporting failure
 * would be a lie that invites them to try again. The failure is logged instead, where
 * it is visible without being destructive.
 *
 * **The actor is the subject.** These events are things a user did to their own
 * account, so `actorId` is the user; when an admin acts on someone else's account
 * (E3) the request context supplies the real actor and the subject stays in
 * `entityId`.
 */
@Injectable()
export class PrismaAuthAuditAdapter implements AuthAuditPort {
  private readonly logger = new Logger('AuthAudit');

  constructor(
    private readonly transactions: TransactionManager,
    private readonly ids: IdService,
  ) {}

  async record(event: AuthAuditEvent): Promise<void> {
    const context = currentRequestContext();

    try {
      await this.transactions.client.auditLog.create({
        data: {
          id: this.ids.next('auditLog'),
          action: event.action,
          entity: 'User',
          entityId: event.entityId ?? event.userId,
          actorId: context?.actor?.id ?? event.userId,
          actorRole: context?.actor?.roles[0] ?? null,
          changes: event.details ?? undefined,
          ip: context?.ip ?? null,
          userAgent: context?.userAgent?.slice(0, 400) ?? null,
          // Correlates the row with every log line the same request produced.
          requestId: context?.requestId ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        { action: event.action, userId: event.userId, requestId: context?.requestId },
        `failed to write the audit row: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
