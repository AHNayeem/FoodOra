import type { Result } from '../../../../shared/kernel';
import { fail, ok } from '../../../../shared/kernel';
import { RegionError } from '../region-errors';

/** One entry of a country's language set, as the admin screen submits it. */
export interface LanguageSetEntry {
  languageCode: string;
  isDefault: boolean;
  sort: number;
}

/**
 * "Which languages is this country served in, and which one is default?" — the whole
 * invariant, as a pure function.
 *
 * Exactly one default is not a formality. `Country.defaultLocale` decides what a new
 * account there gets and what an anonymous visitor sees before choosing, so zero
 * defaults means the locale resolver falls through to English for a market that does
 * not read it, and two means it depends on row order. Both are the kind of bug that
 * shows up as "the site is in the wrong language for some people".
 *
 * The generous readings are applied deliberately rather than refused, because they are
 * unambiguous: a single language is its own default whether the caller said so or not,
 * and duplicates collapse. What cannot be guessed — which of two claimed defaults was
 * meant — is the only thing refused.
 */
export function normaliseLanguageSet(
  entries: readonly LanguageSetEntry[],
): Result<LanguageSetEntry[]> {
  if (entries.length === 0) return fail(RegionError.noDefaultLanguage);

  // Last write wins per code, so a form that submits a language twice is not a refusal.
  const byCode = new Map<string, LanguageSetEntry>();
  for (const entry of entries) byCode.set(entry.languageCode, entry);
  const unique = [...byCode.values()];

  const defaults = unique.filter((entry) => entry.isDefault);
  if (defaults.length > 1) return fail(RegionError.noDefaultLanguage);

  const chosen = defaults[0]?.languageCode ?? unique[0].languageCode;

  return ok(
    unique
      .map((entry) => ({ ...entry, isDefault: entry.languageCode === chosen }))
      // The default sorts first, then by the caller's order — so the switcher's first
      // option is the one the country actually uses.
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sort - b.sort)
      .map((entry, index) => ({ ...entry, sort: index })),
  );
}

/** The default language of a set, for writing back onto `Country.defaultLocale`. */
export function defaultLanguageOf(entries: readonly LanguageSetEntry[]): string | null {
  return entries.find((entry) => entry.isDefault)?.languageCode ?? null;
}
