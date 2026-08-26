/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import { currentRequestContext } from '../../../common/context';
import { DomainError, ErrorCode } from '../../../common/errors';
import { Prisma } from '../generated';
import { HAS_DELETED_BY, SOFT_DELETE_MODELS } from '../model-metadata';

/**
 * `deletedAt IS NULL` means active (D2 §Soft delete). Every read is filtered
 * here rather than in 300 repository methods, because the one method that
 * forgets is the one that shows a customer a deleted restaurant.
 *
 * ## Why `delete` throws instead of being rewritten
 *
 * `main.prisma` §3 describes this extension as turning `delete` into an update.
 * Rewriting the operation inside a `query` extension is possible only by
 * calling `update` on a *captured* client — and that captured client is not the
 * transaction client when the delete happens inside `$transaction`, so the
 * "delete" would silently commit outside the caller's transaction. Rather than
 * ship a soft delete that escapes transactions, this extension refuses
 * `delete`/`deleteMany` on soft-deletable models and provides
 * `softDelete()` / `restore()`, which run through `getExtensionContext` and
 * therefore stay inside whatever transaction is active.
 *
 * The invariant is the same and it is now impossible to get wrong; the cost is
 * that `prisma.vendor.delete(...)` is a loud error instead of quiet magic.
 */

/** Reads that must never see a tombstone. */
const FILTERED_READS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** `findUnique` cannot take a non-unique filter, so its result is checked instead. */
const UNIQUE_READS = new Set(['findUnique', 'findUniqueOrThrow']);

const BLOCKED_WRITES = new Set(['delete', 'deleteMany']);

/**
 * An explicit `deletedAt` in the caller's `where` is an opt-out — that is how
 * an admin screen lists the recycle bin, or how `restore` finds its row.
 */
function callerHandlesTombstones(where: unknown): boolean {
  return typeof where === 'object' && where !== null && 'deletedAt' in where;
}

export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',

  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!SOFT_DELETE_MODELS.has(model)) return query(args);

        if (BLOCKED_WRITES.has(operation)) {
          throw new DomainError(ErrorCode.INTERNAL_SERVER_ERROR, 'errors.unexpected', {
            cause: new Error(
              `${model}.${operation}() is a hard delete on a soft-deletable model. ` +
                `Use ${model}.softDelete(...) — it stays inside the active transaction.`,
            ),
          });
        }

        if (FILTERED_READS.has(operation)) {
          const typed = args as { where?: Record<string, unknown> };
          if (!callerHandlesTombstones(typed.where)) {
            typed.where = { ...typed.where, deletedAt: null };
          }
          return query(args);
        }

        if (UNIQUE_READS.has(operation)) {
          const row = await query(args);
          // A tombstone is indistinguishable from a missing row to the caller —
          // which is the point: `NOT_FOUND`, never "this used to exist".
          if (row && typeof row === 'object' && 'deletedAt' in row && row.deletedAt !== null) {
            if (operation === 'findUniqueOrThrow') {
              throw new Prisma.PrismaClientKnownRequestError('No record was found', {
                code: 'P2025',
                clientVersion: Prisma.prismaVersion.client,
              });
            }
            return null;
          }
          return row;
        }

        return query(args);
      },
    },
  },

  model: {
    $allModels: {
      /**
       * The supported way to remove a row. Runs through the extension context,
       * so inside `$transaction(tx => tx.vendor.softDelete(...))` it enlists in
       * that transaction like any other write.
       */
      async softDelete<T>(this: T, args: { where: unknown }): Promise<unknown> {
        const context = Prisma.getExtensionContext(this) as any;
        const model: string = context.$name;

        if (!SOFT_DELETE_MODELS.has(model)) {
          throw new DomainError(ErrorCode.INTERNAL_SERVER_ERROR, 'errors.unexpected', {
            cause: new Error(
              `${model} has no deletedAt column — it is append-only by design. ` +
                `Supersede the row instead of deleting it (main.prisma §3).`,
            ),
          });
        }

        const actorId = currentRequestContext()?.actor?.id;
        return context.updateMany({
          where: { ...(args.where as object), deletedAt: null },
          data: {
            deletedAt: new Date(),
            ...(HAS_DELETED_BY.has(model) && actorId ? { deletedBy: actorId } : {}),
          },
        });
      },

      /** Undo. The row was never gone, which is the whole reason for soft delete. */
      async restore<T>(this: T, args: { where: unknown }): Promise<unknown> {
        const context = Prisma.getExtensionContext(this) as any;
        const model: string = context.$name;

        return context.updateMany({
          where: { ...(args.where as object), deletedAt: { not: null } },
          data: {
            deletedAt: null,
            ...(HAS_DELETED_BY.has(model) ? { deletedBy: null } : {}),
          },
        });
      },
    },
  },
});
