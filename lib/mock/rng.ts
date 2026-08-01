/**
 * rng.ts — the deterministic randomness the synthesising seeds share.
 *
 * Several parts of the prototype cannot ship a static list: a vendor's week of
 * orders (C10), a venue's book (C16) and a rider's trip history (C18) all have
 * to look busy *and* be anchored to the current clock. They are therefore
 * generated on request from a seeded PRNG, so the same input always produces the
 * same output — a reload never reshuffles a rider's earnings or double-books a
 * table that was free a second ago.
 *
 * Extracted in Phase C18, when a third domain needed the same two functions.
 * Nothing here reads the clock; callers pass `now` in.
 */

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG. Chosen because it is
 * ten lines and reproducible across environments, which a `Math.random()` cannot
 * be (and which `Math.random()` also cannot be *seeded*).
 */
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** FNV-1a — turns a stable string key (an id, a date) into a seed. */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** Pick one element using a seeded generator. */
export function pick<T>(pool: readonly T[], rand: () => number): T {
  return pool[Math.floor(rand() * pool.length)];
}
