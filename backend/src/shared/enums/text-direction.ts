/**
 * Which way a language reads.
 *
 * `frontend/config/i18n/config.ts` carries this as `dir: "ltr" | "rtl"` and the
 * root layout puts it straight into `<html dir>`, so it is not decoration — it is
 * the one field that decides whether the Arabic build lays out correctly. Serving
 * it from `Language.direction` is what lets a language be added by an operator
 * rather than by a deploy.
 */
export const TEXT_DIRECTIONS = ['ltr', 'rtl'] as const;

export type TextDirection = (typeof TEXT_DIRECTIONS)[number];
