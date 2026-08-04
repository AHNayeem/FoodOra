import type { FoodItemRecord, FoodOptionGroupRecord } from '../../../catalog/domain';
import { CartError, type CartErrorKey } from '../cart-errors';
import type { CartOptionRecord } from '../models';

/**
 * Variant and add-on validation — "is this a dish somebody could actually order".
 *
 * ## What a "variant" and an "add-on" are here
 *
 * The same thing, structurally, and that is a Phase C decision this file honours rather
 * than revisits. `FoodOptionGroup` has `required`, `min` and `max`, and those three fields
 * express both ideas: a **variant** group is `required` with `max: 1` (a pizza has exactly
 * one size), an **add-on** group is optional with `max: n` (up to three extra toppings).
 * Adding a `kind: 'variant' | 'addon'` discriminator would let the API describe the
 * difference and would let the two get out of step with the numbers that actually
 * constrain the choice.
 *
 * ## Why the server validates what the UI already prevents
 *
 * `item-customizer.tsx` will not let you exceed a maximum or deselect the last radio
 * button, so on the happy path every rule below is redundant. They are here because the
 * UI is not the only client — the QR menu builds lines, the AI assistant suggests them,
 * and a mutation is an API — and because "the form prevents it" stops being true the
 * moment a menu changes underneath a page that was rendered ten minutes ago. The
 * interesting case is not an attacker; it is a customer whose open tab still shows a
 * "Large" option that the merchant deleted.
 *
 * ## The one rule deliberately weaker than it looks
 *
 * `min` is enforced only on `required` groups. On an optional group, `min` reads as "if you
 * pick any, pick at least this many", and the frontend renders such a group as "choose up
 * to {max}" with no lower bound at all. Enforcing `min` there would refuse selections the
 * shipped UI actively produces.
 */

export interface SelectionFailure {
  key: CartErrorKey;
  /** ICU params for the message — the group's name, the limit that was exceeded. */
  params?: Record<string, unknown>;
}

export type SelectionResult =
  | { ok: true; options: CartOptionRecord[] }
  | { ok: false; failure: SelectionFailure };

/**
 * Resolves the client's option ids against the dish's real option groups.
 *
 * Returns the *resolved* options — name and `priceDelta` read from the stored row, never
 * from the request — in menu order rather than the order they were sent. Menu order is
 * what makes the line id stable and what makes two clients that chose the same options in
 * different sequences produce the same line.
 */
export function resolveSelection(food: FoodItemRecord, optionIds: readonly string[]): SelectionResult {
  const requested = new Set(optionIds);
  if (requested.size !== optionIds.length) {
    return { ok: false, failure: { key: CartError.duplicateOption } };
  }

  const resolved: CartOptionRecord[] = [];
  const seen = new Set<string>();

  for (const group of food.optionGroups) {
    const chosen = group.options.filter((option) => requested.has(option.id));

    const failure = checkGroup(group, chosen.length);
    if (failure) return { ok: false, failure };

    for (const option of chosen) {
      seen.add(option.id);
      resolved.push({
        groupId: group.id,
        optionId: option.id,
        name: option.name,
        priceDelta: option.priceDelta,
      });
    }
  }

  // Anything left over belongs to another dish, or to a group that was deleted. Either
  // way the line cannot be priced, and silently dropping it would charge for a pizza the
  // customer did not configure.
  const orphan = optionIds.find((id) => !seen.has(id));
  if (orphan !== undefined) {
    return { ok: false, failure: { key: CartError.unknownOption, params: { optionId: orphan } } };
  }

  return { ok: true, options: resolved };
}

function checkGroup(group: FoodOptionGroupRecord, count: number): SelectionFailure | null {
  if (count > group.max) {
    return { key: CartError.tooManyOptions, params: { group: group.name, max: group.max } };
  }
  if (group.required && count < group.min) {
    return { key: CartError.optionGroupRequired, params: { group: group.name, min: group.min } };
  }
  return null;
}
