/**
 * The transaction boundary, as an application handler sees it.
 *
 * D1 says the handler declares the boundary and repositories enlist
 * automatically. E1 built that as `TransactionManager` — but `TransactionManager`
 * lives in `infrastructure/prisma`, and `application/` may not import
 * `infrastructure/`; ESLint fails the build on it. Rather than carve out an
 * exception, the boundary is published as a contract: `PrismaModule` satisfies it,
 * and a handler declares "these writes are one act" without knowing that Postgres
 * is what makes them one.
 *
 * Nesting joins the outer transaction rather than opening a second one — two
 * concurrent transactions inside one request is not a nested unit of work, it is a
 * deadlock waiting for load.
 */
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

export interface UnitOfWorkPort {
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
