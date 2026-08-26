import { type Environment, validateEnvironment } from './validation.schema';

/**
 * The single parse of `process.env` in the whole process.
 *
 * `ConfigModule.forRoot({ validate })` calls `validateEnvironment` during
 * bootstrap; we memoise the result here so the `registerAs` factories below get
 * the *coerced* values (numbers as numbers, booleans as booleans) rather than
 * re-reading the strings @nestjs/config writes back into `process.env`.
 *
 * Standalone scripts (schema emission, migrations, workers) call
 * `loadEnvironment()` directly and get the same validation for free.
 */
let cached: Environment | undefined;

export function validateAndCache(raw: Record<string, unknown>): Environment {
  cached = validateEnvironment(raw);
  return cached;
}

export function loadEnvironment(): Environment {
  cached ??= validateEnvironment(process.env);
  return cached;
}

/** Test-only: forget the parse so a different environment can be loaded. */
export function resetEnvironmentCache(): void {
  cached = undefined;
}
