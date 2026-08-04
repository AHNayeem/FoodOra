/**
 * What a failed probe is allowed to say.
 *
 * Nginx proxies `/health/*` to the API, so a readiness body can be reachable
 * from outside. Prisma's connection error names the host and port it tried —
 * useful in development, an unnecessary gift to a scanner in production. Deep
 * checks are authenticated (D10 §Health checks); the others say only that the
 * dependency is unreachable.
 *
 * Prisma also formats its errors across several blank-line-separated
 * paragraphs, which turns one probe into six lines of JSON. Only the first
 * meaningful line carries information.
 */
export function describeFailure(error: unknown, isProduction: boolean): string {
  if (isProduction) return 'unreachable';

  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ?? 'unreachable';
}
