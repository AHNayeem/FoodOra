/**
 * options.js — the modifier rules, both directions.
 *
 * A modifier group is asked two different questions and they are not the same
 * question, so this file answers them separately:
 *
 *  - **authoring** — "is this group buildable?" `groupError` is the merchant's
 *    answer, returned when they save the dialog;
 *  - **selection** — "is this what a customer picked orderable?" `checkSelection`
 *    is the customer's answer, and it is the function module 6 will call from the
 *    cart rather than writing a second copy of these rules.
 *
 * Pure, like `availability.js`: rows in, verdict out, no clock and no Prisma.
 *
 * ## The shape the schema actually gives us
 *
 * Worth stating before anything else, because the brief asks for "item ↔
 * modifier-group relationships" and the database does not have one:
 * `FoodOptionGroup.foodId` is a **required, single** foreign key. A group belongs
 * to exactly one dish. There is no library of shared groups and no join table, so
 * "attach a group to an item" is "create the group on the item", and a group can
 * never be pointed at the wrong dish because it has nowhere else to point. The
 * frontend agrees — `types/catalog.ts::FoodItem.optionGroups` is an owned array,
 * not a list of ids — and `lib/menu.ts` edits groups *inside* the item dialog for
 * the same reason. A reusable-group library is a real product feature and a real
 * schema change; it is named in M5 §"Deferred" rather than smuggled in here.
 *
 * ## Authoring rules
 *
 * `frontend/lib/menu.ts::optionGroupError`, term for term, because the merchant's
 * builder already refuses exactly these and a server that refused a different set
 * would make the dialog wrong in one direction or the other:
 *
 *     name non-empty ∧ options ≥ 1 ∧ min ≥ 0 ∧ max ≥ 1 ∧ min ≤ max
 *       ∧ max ≤ options ∧ (required → min ≥ 1) ∧ every option named
 *
 * `max ≤ options` is why a group is created **with its options in one call** and
 * why removing an option re-checks the group it left: an empty group with
 * `max: 1` fails its own rule, so there is no moment at which a half-built group
 * exists to be read by a customer.
 *
 * One deliberate non-rule: `min ≥ 1` with `required: false` is **accepted**,
 * because `optionGroupError` accepts it and the frontend's dialog can produce it.
 * Selection treats `min` as the authority — a group with a minimum of one is
 * enforced as one whatever the flag says — so the pair cannot disagree about what
 * a customer must do. The flag only decides how the group is labelled.
 */

/** `frontend/lib/menu.ts::MenuError`, the members this file can return. */
export const GROUP_ERRORS = Object.freeze({
  name: "errors.nameRequired",
  noOptions: "errors.optionsRequired",
  range: "errors.optionRangeInvalid",
});

/** Machine-readable selection violations. Not i18n keys — see `checkSelection`. */
export const SELECTION_CODES = Object.freeze([
  "item-unavailable",
  "unknown-option",
  "inactive-option",
  "duplicate-option",
  "min-selections",
  "max-selections",
]);

const named = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * What is wrong with a group and the options it would hold, or `null`.
 *
 * `options` is the **active** option list the group will have once the write
 * lands, not the list it has now: an update that deactivates two options and
 * lowers `max` in the same breath has to be judged on the result, not on either
 * half of it.
 */
export function groupError(group, options = []) {
  if (!named(group.name)) return GROUP_ERRORS.name;
  if (options.length === 0) return GROUP_ERRORS.noOptions;
  if (options.some((option) => !named(option.name))) return GROUP_ERRORS.name;

  const min = Number(group.min);
  const max = Number(group.max);
  if (!Number.isInteger(min) || !Number.isInteger(max)) return GROUP_ERRORS.range;
  if (min < 0 || max < 1 || min > max || max > options.length) return GROUP_ERRORS.range;
  if (group.required === true && min < 1) return GROUP_ERRORS.range;

  return null;
}

/**
 * Is what a customer picked orderable, and what does it cost?
 *
 * Returns a **report**, not a refusal, and that is a deliberate choice about the
 * error contract. `shared/errors/envelope.js` requires a refusal's `key` to be an
 * i18n key the client can render, and the three locale files have no message for
 * "you must choose at least two toppings" — the customiser (`components/cart/
 * item-customizer.tsx`) makes an invalid selection unclickable rather than
 * explaining it, so the string was never needed. Inventing keys here would put
 * untranslated text on a screen. So the violations are machine-readable codes,
 * every caller gets the whole list at once instead of the first failure, and
 * module 6 maps them to keys when it builds the surface that renders them.
 *
 * The rules, in order:
 *
 *  1. the dish itself has to be orderable — `deriveItemAvailability`'s answer,
 *     passed in, because whether a section is active is not this file's business;
 *  2. every chosen id must be an **active option of a group of this dish**. An id
 *     from another dish's group is `unknown-option` and not `inactive-option`:
 *     from the customer's side the two are the same mistake, and saying which
 *     would let somebody enumerate another restaurant's menu by id;
 *  3. no id twice. `CartItemOption` is keyed per option, so a duplicate is a
 *     malformed selection rather than "two of these";
 *  4. per group, `min ≤ chosen ≤ max`. `min` is the authority for a required
 *     group, per the header.
 *
 * `unitPrice` is the dish's price plus every chosen `priceDelta` — the same sum
 * `item-customizer.tsx` shows in its footer. It is **not** a quote: quantity,
 * tax, coupons and the vendor's currency are module 7's, and the number is here
 * so a caller can check its own arithmetic against the server's before then.
 */
export function checkSelection({ item, groups = [], chosen = [], available = true }) {
  const violations = [];
  if (!available) violations.push({ code: "item-unavailable", groupId: null, optionId: null });

  /** Active options of this dish, by id — the only ids that may appear. */
  const optionsById = new Map();
  for (const group of groups) {
    for (const option of group.options ?? []) {
      if (option.isAvailable === true) optionsById.set(option.id, { option, group });
    }
  }

  const seen = new Set();
  /** groupId → chosen option ids, so the per-group counts below are one pass. */
  const perGroup = new Map(groups.map((group) => [group.id, []]));

  for (const id of chosen) {
    if (seen.has(id)) {
      violations.push({ code: "duplicate-option", groupId: optionsById.get(id)?.group.id ?? null, optionId: id });
      continue;
    }
    seen.add(id);

    const hit = optionsById.get(id);
    if (!hit) {
      violations.push({ code: "unknown-option", groupId: null, optionId: id });
      continue;
    }
    perGroup.get(hit.group.id).push(id);
  }

  for (const group of groups) {
    const count = perGroup.get(group.id).length;
    if (count < group.min) {
      violations.push({ code: "min-selections", groupId: group.id, optionId: null, min: group.min, chosen: count });
    }
    if (count > group.max) {
      violations.push({ code: "max-selections", groupId: group.id, optionId: null, max: group.max, chosen: count });
    }
  }

  return { valid: violations.length === 0, violations, selected: [...seen].filter((id) => optionsById.has(id)) };
}

export default { GROUP_ERRORS, SELECTION_CODES, groupError, checkSelection };
