/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import { ConflictError } from '../../../common/errors';
import { Prisma } from '../generated';
import { VERSIONED_MODELS } from '../model-metadata';

/**
 * Optimistic locking (D2 §Optimistic locking, main.prisma §4).
 *
 * Two things happen here, and they are deliberately separate:
 *
 * 1. **Every** update to a versioned model bumps `version`. Automatic, because
 *    a bump that a repository can forget is a lock that silently stops working.
 * 2. `updateVersioned()` is the *guarded* write — `updateMany` filtered on the
 *    version the caller read, with a zero-row result raised as `CONFLICT`
 *    carrying `currentVersion` so the client can prompt a reload (D5 §Errors).
 *
 * The guard is opt-in rather than automatic because most writes have no
 * concurrent editor. The ones that do — a merchant and the autopilot both
 * advancing an order, two admins editing one CMS document, a reservation being
 * confirmed while the guest cancels it — call `updateVersioned` and mean it.
 */
const BUMPS_VERSION = new Set(['update', 'updateMany', 'updateManyAndReturn']);

export const optimisticLockExtension = Prisma.defineExtension({
  name: 'optimistic-lock',

  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!VERSIONED_MODELS.has(model)) return query(args);

        if (BUMPS_VERSION.has(operation)) {
          const typed = args as { data?: Record<string, unknown> };
          if (typed.data && !('version' in typed.data)) {
            typed.data.version = { increment: 1 };
          }
        } else if (operation === 'upsert') {
          const typed = args as { update?: Record<string, unknown> };
          if (typed.update && !('version' in typed.update)) {
            typed.update.version = { increment: 1 };
          }
        }

        return query(args);
      },
    },
  },

  model: {
    $allModels: {
      /**
       * Guarded update. Returns the updated row; throws `ConflictError` when
       * somebody else got there first.
       *
       * `updateMany` rather than `update` on purpose — it takes a non-unique
       * `where`, which is what lets the version become part of the predicate,
       * and it reports the row count instead of throwing an opaque `P2025`.
       */
      async updateVersioned<T>(
        this: T,
        args: { where: { id: string }; data: Record<string, unknown>; expectedVersion: number },
      ): Promise<unknown> {
        const context = Prisma.getExtensionContext(this) as any;
        const model: string = context.$name;

        if (!VERSIONED_MODELS.has(model)) {
          throw new Error(
            `${model} has no version column — it is append-only, so there is nothing to lock.`,
          );
        }

        const { count } = await context.updateMany({
          where: { ...args.where, version: args.expectedVersion },
          data: args.data,
        });

        if (count === 0) {
          // Distinguish "someone else wrote first" from "it is gone": the
          // client's next move differs — reload versus 404.
          const current = await context.findUnique({
            where: args.where,
            select: { version: true },
          });
          throw new ConflictError(current?.version as number | undefined);
        }

        return context.findUnique({ where: args.where });
      },
    },
  },
});
