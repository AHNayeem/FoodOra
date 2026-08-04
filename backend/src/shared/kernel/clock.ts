/**
 * Time is a dependency, not an ambient fact.
 *
 * Phase C's whole design rests on **derived state**: a coupon is expired
 * because its window has passed, a reservation is completed because its sitting
 * has elapsed, a paused subscription resumes itself. Nothing sweeps those
 * flags — they are recomputed against "now". That is only testable if "now" is
 * injected, so no service may call `Date.now()` directly.
 */
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  /** Milliseconds since the epoch. */
  now(): number;
  /** The same instant as a `Date`. */
  date(): Date;
  /** ISO-8601, the wire format `types/common.ts::ISODate` describes. */
  iso(): string;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
  date(): Date {
    return new Date();
  }
  iso(): string {
    return new Date().toISOString();
  }
}

/** Tests advance time deliberately; nothing sleeps. */
export class FakeClock implements Clock {
  constructor(private current: number = Date.parse('2026-01-01T12:00:00.000Z')) {}

  now(): number {
    return this.current;
  }
  date(): Date {
    return new Date(this.current);
  }
  iso(): string {
    return new Date(this.current).toISOString();
  }
  /** Move forward; negative values are allowed for "what did this look like then". */
  advance(ms: number): this {
    this.current += ms;
    return this;
  }
  set(instant: number | string | Date): this {
    this.current = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
    return this;
  }
}
