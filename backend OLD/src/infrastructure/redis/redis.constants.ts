/**
 * Three connections, three logical databases (D10 §Data stores).
 *
 * They are separate tokens rather than one shared client because they have
 * genuinely different failure semantics: the cache is disposable and evicts
 * under memory pressure (`allkeys-lru`), the queue is not and must never evict
 * (`noeviction` — an evicted job is lost work), and pub/sub traffic would
 * otherwise churn the cache's working set. A `FLUSHDB` on the cache must not be
 * able to drop tomorrow's payouts.
 */
export const REDIS_CACHE = Symbol('REDIS_CACHE');
export const REDIS_QUEUE = Symbol('REDIS_QUEUE');
export const REDIS_PUBSUB = Symbol('REDIS_PUBSUB');
