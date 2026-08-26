import { currentRequestContext } from '../../../common/context';
import { Prisma } from '../generated';
import { HAS_CREATED_BY, HAS_UPDATED_BY } from '../model-metadata';

/**
 * Stamps *who* alongside Prisma's *when*.
 *
 * `createdAt` / `updatedAt` are the schema's job (`@default(now())`,
 * `@updatedAt`). `createdBy` / `updatedBy` need the actor, and the actor lives
 * on the request context — so stamping them here means a repository cannot
 * forget, and a background job (which has no actor) simply leaves them null
 * rather than inventing one.
 *
 * This is not the audit *log*. `AuditLog` rows — the before/after diff an admin
 * reads — are written by the audit interceptor in E10. This is the cheap
 * always-on provenance on the row itself.
 */
const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);
const UPDATE_OPS = new Set(['update', 'updateMany', 'updateManyAndReturn']);

function stamp(data: unknown, field: string, actorId: string): void {
  if (Array.isArray(data)) {
    for (const row of data) stamp(row, field, actorId);
    return;
  }
  if (typeof data === 'object' && data !== null && !(field in data)) {
    (data as Record<string, unknown>)[field] = actorId;
  }
}

export const auditExtension = Prisma.defineExtension({
  name: 'audit',

  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const actorId = currentRequestContext()?.actor?.id;
        if (!actorId) return query(args);

        const typed = args as { data?: unknown; create?: unknown; update?: unknown };

        if (CREATE_OPS.has(operation) && HAS_CREATED_BY.has(model)) {
          stamp(typed.data, 'createdBy', actorId);
          if (HAS_UPDATED_BY.has(model)) stamp(typed.data, 'updatedBy', actorId);
        } else if (UPDATE_OPS.has(operation) && HAS_UPDATED_BY.has(model)) {
          stamp(typed.data, 'updatedBy', actorId);
        } else if (operation === 'upsert') {
          if (HAS_CREATED_BY.has(model)) stamp(typed.create, 'createdBy', actorId);
          if (HAS_UPDATED_BY.has(model)) {
            stamp(typed.create, 'updatedBy', actorId);
            stamp(typed.update, 'updatedBy', actorId);
          }
        }

        return query(args);
      },
    },
  },
});
