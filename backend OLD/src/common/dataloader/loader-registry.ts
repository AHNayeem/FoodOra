import { Injectable } from '@nestjs/common';
import DataLoader from 'dataloader';

import { RequestContextService } from '../context';

/**
 * Per-request DataLoader registry — the N+1 defence (D5 §Performance).
 *
 * A list of 20 vendor cards that each resolve `vendor.cuisines` is 21 queries
 * without batching and 2 with it. The loader has to be **per request**, not a
 * singleton: its cache would otherwise serve one customer another customer's
 * row, and it would never see an update.
 *
 * Loaders live in the request context's scratch space, so they are created on
 * first use and collected with the request.
 */
@Injectable()
export class LoaderRegistry {
  constructor(private readonly context: RequestContextService) {}

  get<K, V>(key: symbol, create: () => DataLoader<K, V>): DataLoader<K, V> {
    const store = this.context.require().store;
    const existing = store.get(key);
    if (existing) return existing as DataLoader<K, V>;

    const loader = create();
    store.set(key, loader);
    return loader;
  }
}

/**
 * The part everyone gets wrong: DataLoader requires the results array to line
 * up with the keys array, one entry per key, in order — including `null` for
 * keys the query found nothing for. Returning the rows the database happened to
 * return silently pairs the wrong row with the wrong key.
 */
export function alignToKeys<K extends string | number, V>(
  keys: readonly K[],
  rows: readonly V[],
  keyOf: (row: V) => K,
): (V | null)[] {
  const byKey = new Map<K, V>(rows.map((row) => [keyOf(row), row]));
  return keys.map((key) => byKey.get(key) ?? null);
}

/** Same, for one-to-many relations: every key gets an array, empty if none. */
export function groupByKey<K extends string | number, V>(
  keys: readonly K[],
  rows: readonly V[],
  keyOf: (row: V) => K,
): V[][] {
  const groups = new Map<K, V[]>(keys.map((key) => [key, []]));
  for (const row of rows) groups.get(keyOf(row))?.push(row);
  return keys.map((key) => groups.get(key) ?? []);
}
