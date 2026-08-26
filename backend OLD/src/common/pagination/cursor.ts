import { DomainError, ErrorCode } from '../errors';

/**
 * A cursor is base64 of `{ at, id }` — opaque to the client, and a keyset for
 * the query:
 *
 * ```sql
 * WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT n + 1
 * ```
 *
 * Never `OFFSET`. Offset re-counts every skipped row and, on a feed where rows
 * arrive while the user reads, silently repeats and drops items. The `id`
 * tiebreak is what makes the ordering total when two rows share a timestamp.
 */
export interface Cursor {
  /** The sort timestamp, in epoch milliseconds. */
  at: number;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Cursor).at === 'number' &&
      typeof (parsed as Cursor).id === 'string'
    ) {
      return parsed as Cursor;
    }
  } catch {
    // fall through to the same error — a malformed cursor and an unparseable
    // one are the same problem from the client's side.
  }
  throw new DomainError(ErrorCode.BAD_USER_INPUT, 'errors.invalidCursor');
}

export function cursorFor(row: { id: string; createdAt: Date }): string {
  return encodeCursor({ at: row.createdAt.getTime(), id: row.id });
}
