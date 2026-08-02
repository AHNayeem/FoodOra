/**
 * The seam speaks in *vocabulary keys* — a mood is `"comfort"`, a dietary tag is
 * `"keto"`, an allergen is `"peanuts"` — because `services/ai.ts` has no
 * business knowing what any of those are called in Arabic. This is where they
 * become words, once, for every surface that renders an `AssistantSay`.
 *
 * Deliberately not a lookup inside the message shape: keeping the raw key in
 * the store is what lets a persisted conversation re-read itself in a different
 * language (see `types/ai.ts`).
 */

/** Just enough of next-intl's translator for this to work on both sides. */
export type Translate = (key: string) => string;

/** Values whose *content* is a key, and the namespace each resolves under. */
const VOCABULARY: Record<string, string> = {
  mood: "mood",
  tag: "dietary",
  allergen: "allergen",
  type: "vendorType",
  goal: "goal",
  slot: "slot",
};

/**
 * Replace every vocabulary key in an ICU value bag with its translation,
 * leaving names, counts and prices (which are already display-ready) alone.
 */
export function resolveSayValues(
  values: Record<string, string | number> | undefined,
  t: Translate,
): Record<string, string | number> | undefined {
  if (!values) return undefined;
  const resolved: Record<string, string | number> = { ...values };
  for (const [field, namespace] of Object.entries(VOCABULARY)) {
    const value = values[field];
    if (typeof value === "string" && value) resolved[field] = t(`${namespace}.${value}`);
  }
  return resolved;
}
