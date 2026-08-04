/**
 * The two names shared with `backend/src/modules/auth/presentation/cookies.ts`.
 *
 * A separate file so `session.ts` and the Apollo links can both import them
 * without importing each other.
 */
export const CSRF_COOKIE = "csrf";
export const CSRF_HEADER = "x-csrf-token";
