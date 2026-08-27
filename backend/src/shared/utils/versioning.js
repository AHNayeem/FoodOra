/**
 * versioning.js — optimistic locking, as one function.
 *
 * `main.prisma` §4 and BACKEND-REQUIREMENTS §1.4: every mutable aggregate carries
 * `version Int @default(0)`, and a write to one goes through `updateMany` with
 * the version in the `where` clause. Zero rows matched means somebody else wrote
 * first — a **conflict**, not a not-found: the row exists, its version moved.
 *
 * Written as a helper rather than left to each call site because the failure it
 * prevents is invisible. `update({ where: { id }, data })` compiles, runs, and
 * silently discards the other writer's change; the only difference between the
 * correct call and the lost-update bug is the presence of `version`.
 */
import { conflict, notFound } from "../errors/app-error.js";

/**
 * Update one row, but only if nobody has changed it since it was read.
 *
 * @param {object} delegate  `prisma.vendor`, `tx.order`, …
 * @param {{ id: string, version: number, data: object, entity?: string }} input
 * @returns {Promise<object>} the updated row, with the incremented version
 */
export async function updateVersioned(delegate, { id, version, data, entity = "Record" }) {
  if (!Number.isInteger(version)) {
    throw new Error(`updateVersioned requires the version that was read (got ${version}).`);
  }

  const { count } = await delegate.updateMany({
    where: { id, version },
    data: { ...data, version: { increment: 1 } },
  });

  if (count === 0) {
    // Which of the two it is decides what the client should do — retry with a
    // fresh read, or stop — so it is worth the extra query to say.
    const current = await delegate.findUnique({ where: { id }, select: { id: true } });
    throw current
      ? conflict(`${entity} ${id} was modified by someone else`, { details: { id, expectedVersion: version } })
      : notFound(entity);
  }

  return delegate.findUnique({ where: { id } });
}
