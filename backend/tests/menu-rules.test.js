/**
 * menu-rules.test.js — module 5's derivations, with no database at all.
 *
 * The counterpart to `catalog-derivation.test.js`: `availability.js` and
 * `options.js` take rows and return verdicts, so every rule in them can be stated
 * as an assertion about values rather than about a fixture. What is *not* here is
 * anything that needs a `vendorId` to mean something — ownership, the guards and
 * the wire contract are `menu.test.js`'s, against real PostgreSQL.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@foodora/database";
import {
  availableQuantity,
  deriveItemAvailability,
  menuServesAt,
  resolveMenu,
  stockStateOf,
} from "../src/modules/menu/availability.js";
import { checkSelection, groupError } from "../src/modules/menu/options.js";

const D = (value) => new Prisma.Decimal(value);

/** A tracked shelf. Every field a `Decimal`, as the column is. */
const stock = ({ onHand = 0, reserved = 0, lowStockAt = 0, trackStock = true } = {}) => ({
  trackStock,
  onHand: D(onHand),
  reserved: D(reserved),
  lowStockAt: D(lowStockAt),
});

const item = (overrides = {}) => ({ id: "food_x", isAvailable: true, price: D(100), ...overrides });

describe("stock state", () => {
  it("is untracked when there is no row at all", () => {
    assert.equal(stockStateOf(null), "untracked");
    assert.equal(stockStateOf(undefined), "untracked");
  });

  it("is untracked when the row says not to track it, whatever the count", () => {
    // `InventoryItem.trackStock`: "When false the dish never auto-disables on zero stock."
    assert.equal(stockStateOf(stock({ onHand: 0, trackStock: false })), "untracked");
    assert.equal(stockStateOf(stock({ onHand: 900, trackStock: false })), "untracked");
  });

  it("is out at zero and below", () => {
    assert.equal(stockStateOf(stock({ onHand: 0 })), "out");
    assert.equal(stockStateOf(stock({ onHand: -1 })), "out");
  });

  it("counts what is reserved as gone", () => {
    // available = onHand − reserved. Two portions held by an order are not two
    // portions a third customer can buy.
    assert.equal(stockStateOf(stock({ onHand: 2, reserved: 2 })), "out");
    assert.equal(stockStateOf(stock({ onHand: 3, reserved: 2 })), "in-stock");
    assert.equal(availableQuantity(stock({ onHand: 3, reserved: 2 })).toString(), "1");
  });

  it("is low at or below the threshold, and the threshold is inclusive", () => {
    assert.equal(stockStateOf(stock({ onHand: 5, lowStockAt: 5 })), "low");
    assert.equal(stockStateOf(stock({ onHand: 6, lowStockAt: 5 })), "in-stock");
  });

  it("treats a threshold of zero as no warning, not as a warning at zero", () => {
    assert.equal(stockStateOf(stock({ onHand: 4, lowStockAt: 0 })), "in-stock");
  });

  it("counts fractions — a kilogram of chicken is not an integer", () => {
    assert.equal(stockStateOf(stock({ onHand: "0.500", lowStockAt: "1.000" })), "low");
    assert.equal(stockStateOf(stock({ onHand: "0.001" })), "in-stock");
  });
});

describe("availability — the merchant switch AND (untracked OR in stock)", () => {
  it("is true for a switched-on, untracked dish", () => {
    const verdict = deriveItemAvailability({ item: item(), inventory: null });
    assert.equal(verdict.isAvailable, true);
    assert.equal(verdict.stockState, "untracked");
    assert.equal(verdict.reason, null);
  });

  it("is false when the merchant switched it off, whatever the shelf says", () => {
    const verdict = deriveItemAvailability({ item: item({ isAvailable: false }), inventory: stock({ onHand: 99 }) });
    assert.equal(verdict.isAvailable, false);
    assert.equal(verdict.reason, "switched-off");
  });

  it("is false when a tracked dish has run out", () => {
    const verdict = deriveItemAvailability({ item: item(), inventory: stock({ onHand: 0 }) });
    assert.equal(verdict.isAvailable, false);
    assert.equal(verdict.reason, "out-of-stock");
  });

  it("is true when an untracked dish has a count of zero", () => {
    // The whole point of `trackStock`: a dish cooked to order is not sold out
    // because nobody counted it.
    const verdict = deriveItemAvailability({ item: item(), inventory: stock({ onHand: 0, trackStock: false }) });
    assert.equal(verdict.isAvailable, true);
  });

  it("is false inside a switched-off section, and says so before it mentions stock", () => {
    const verdict = deriveItemAvailability({ item: item(), inventory: stock({ onHand: 0 }), sectionActive: false });
    assert.equal(verdict.isAvailable, false);
    // The order of the checks is the order of the fixes: restocking does not
    // bring back a dish inside a section nobody switched on.
    assert.equal(verdict.reason, "section-inactive");
  });

  it("is false on a switched-off menu, which outranks everything below it", () => {
    const verdict = deriveItemAvailability({ item: item(), menuActive: false, sectionActive: false });
    assert.equal(verdict.reason, "menu-inactive");
  });
});

describe("menu windows", () => {
  const at = (hhmm) => new Date(`2026-09-01T${hhmm}:00.000Z`);

  it("serves all day when there is no window", () => {
    assert.equal(menuServesAt({ availableFrom: null, availableTo: null }, { now: at("03:00") }), true);
  });

  it("serves all day when only half a window is set — half a window is not a window", () => {
    assert.equal(menuServesAt({ availableFrom: "07:00", availableTo: null }, { now: at("03:00") }), true);
  });

  it("holds a breakfast menu to the morning", () => {
    const breakfast = { availableFrom: "07:00", availableTo: "11:00" };
    assert.equal(menuServesAt(breakfast, { now: at("08:30") }), true);
    assert.equal(menuServesAt(breakfast, { now: at("11:00") }), false, "the end is exclusive");
    assert.equal(menuServesAt(breakfast, { now: at("06:59") }), false);
  });

  it("reads an inverted pair as an overnight window", () => {
    const late = { availableFrom: "22:00", availableTo: "02:00" };
    assert.equal(menuServesAt(late, { now: at("23:30") }), true);
    assert.equal(menuServesAt(late, { now: at("01:30") }), true);
    assert.equal(menuServesAt(late, { now: at("12:00") }), false);
  });

  it("reads the window in the branch's timezone, not the server's", () => {
    // 03:00 UTC is 09:00 in Dhaka, which is inside breakfast — and outside it in UTC.
    const breakfast = { availableFrom: "07:00", availableTo: "11:00" };
    assert.equal(menuServesAt(breakfast, { now: at("03:00"), timezone: "Asia/Dhaka" }), true);
    assert.equal(menuServesAt(breakfast, { now: at("03:00"), timezone: "UTC" }), false);
  });

  it("serves all day when the window is unparseable, rather than never", () => {
    assert.equal(menuServesAt({ availableFrom: "not-a-time", availableTo: "11:00" }, { now: at("20:00") }), true);
  });
});

describe("menu resolution", () => {
  const menu = (overrides) => ({ isActive: true, isDefault: false, availableFrom: null, availableTo: null, ...overrides });
  const now = new Date("2026-09-01T20:00:00.000Z");

  it("prefers the default", () => {
    const picked = resolveMenu([menu({ id: "a", name: "A" }), menu({ id: "b", name: "B", isDefault: true })], { now });
    assert.equal(picked.id, "b");
  });

  it("falls back to the name, so two callers a millisecond apart agree", () => {
    const picked = resolveMenu([menu({ id: "z", name: "Zebra" }), menu({ id: "a", name: "Apple" })], { now });
    assert.equal(picked.id, "a");
  });

  it("ignores an inactive menu", () => {
    const picked = resolveMenu([menu({ id: "a", name: "A", isActive: false, isDefault: true }), menu({ id: "b", name: "B" })], { now });
    assert.equal(picked.id, "b");
  });

  it("does not fall back to a menu that is not serving", () => {
    // No fallback on purpose: answering with a board the kitchen will not cook
    // from is worse than answering with nothing.
    const breakfast = menu({ id: "a", name: "Breakfast", isDefault: true, availableFrom: "07:00", availableTo: "11:00" });
    assert.equal(resolveMenu([breakfast], { now }), null);
  });

  it("picks the one that is serving over the default that is not", () => {
    const breakfast = menu({ id: "a", name: "Breakfast", isDefault: true, availableFrom: "07:00", availableTo: "11:00" });
    const dinner = menu({ id: "b", name: "Dinner", availableFrom: "17:00", availableTo: "23:00" });
    assert.equal(resolveMenu([breakfast, dinner], { now }).id, "b");
  });
});

describe("option groups — the authoring rules", () => {
  const options = (count) => Array.from({ length: count }, (_, index) => ({ name: `Option ${index}` }));

  it("accepts a radio group", () => {
    assert.equal(groupError({ name: "Size", required: true, min: 1, max: 1 }, options(3)), null);
  });

  it("refuses a group with no name", () => {
    assert.equal(groupError({ name: "  ", required: false, min: 0, max: 1 }, options(2)), "errors.nameRequired");
  });

  it("refuses a group with no options — a control nobody can satisfy", () => {
    assert.equal(groupError({ name: "Size", required: false, min: 0, max: 1 }, []), "errors.optionsRequired");
  });

  it("refuses an unnamed option", () => {
    assert.equal(groupError({ name: "Size", min: 0, max: 1 }, [{ name: "" }]), "errors.nameRequired");
  });

  it("refuses min above max", () => {
    assert.equal(groupError({ name: "Size", min: 3, max: 2 }, options(4)), "errors.optionRangeInvalid");
  });

  it("refuses a max above the number of options", () => {
    assert.equal(groupError({ name: "Add-ons", min: 0, max: 4 }, options(3)), "errors.optionRangeInvalid");
  });

  it("refuses a required group that can be satisfied by choosing nothing", () => {
    assert.equal(groupError({ name: "Size", required: true, min: 0, max: 1 }, options(2)), "errors.optionRangeInvalid");
  });

  it("refuses a max below one", () => {
    assert.equal(groupError({ name: "Size", min: 0, max: 0 }, options(2)), "errors.optionRangeInvalid");
  });

  it("refuses a negative minimum", () => {
    assert.equal(groupError({ name: "Size", min: -1, max: 1 }, options(2)), "errors.optionRangeInvalid");
  });

  it("accepts min ≥ 1 without `required`, because the frontend's own editor does", () => {
    // Deliberately not refused — `lib/menu.ts::optionGroupError` accepts it, and a
    // server that refused it would make the dialog wrong. Selection treats `min`
    // as the authority, so the two cannot disagree about what a customer must do.
    assert.equal(groupError({ name: "Size", required: false, min: 1, max: 1 }, options(2)), null);
  });

  it("judges the group on the options it will have, not the ones it has", () => {
    // Switching two options off and lowering `max` in one breath is legal; doing
    // only the first is not.
    assert.equal(groupError({ name: "Add-ons", min: 0, max: 3 }, options(1)), "errors.optionRangeInvalid");
    assert.equal(groupError({ name: "Add-ons", min: 0, max: 1 }, options(1)), null);
  });
});

describe("selection — what a customer picked", () => {
  const option = (id, extra = {}) => ({ id, name: id, priceDelta: 0, isAvailable: true, ...extra });
  const size = {
    id: "fog_size",
    min: 1,
    max: 1,
    required: true,
    options: [option("fop_small"), option("fop_large", { priceDelta: 100 })],
  };
  const addons = {
    id: "fog_addons",
    min: 0,
    max: 2,
    required: false,
    options: [option("fop_bacon"), option("fop_cheese"), option("fop_gone", { isAvailable: false })],
  };

  const check = (chosen, extra = {}) =>
    checkSelection({ item: item(), groups: [size, addons], chosen, available: true, ...extra });

  it("accepts a valid selection", () => {
    const verdict = check(["fop_large", "fop_bacon"]);
    assert.equal(verdict.valid, true);
    assert.deepEqual(verdict.violations, []);
  });

  it("refuses a required group left empty", () => {
    const verdict = check(["fop_bacon"]);
    assert.equal(verdict.valid, false);
    assert.equal(verdict.violations[0].code, "min-selections");
    assert.equal(verdict.violations[0].groupId, "fog_size");
  });

  it("refuses more than the maximum", () => {
    const verdict = check(["fop_small", "fop_bacon", "fop_cheese", "fop_gone"]);
    assert.ok(verdict.violations.some((violation) => violation.code === "max-selections" || violation.code === "inactive-option" || violation.code === "unknown-option"));
  });

  it("refuses an option that is switched off", () => {
    const verdict = check(["fop_small", "fop_gone"]);
    assert.equal(verdict.valid, false);
    // An inactive option is indistinguishable from an unknown one on purpose —
    // otherwise the refusal enumerates the menu.
    assert.equal(verdict.violations[0].code, "unknown-option");
  });

  it("refuses an option belonging to another dish's group", () => {
    const verdict = check(["fop_small", "fop_someone_elses"]);
    assert.equal(verdict.valid, false);
    assert.equal(verdict.violations.find((violation) => violation.optionId === "fop_someone_elses").code, "unknown-option");
  });

  it("refuses the same option twice", () => {
    const verdict = check(["fop_small", "fop_bacon", "fop_bacon"]);
    assert.ok(verdict.violations.some((violation) => violation.code === "duplicate-option"));
  });

  it("refuses everything when the dish itself is unavailable", () => {
    const verdict = check(["fop_small"], { available: false });
    assert.equal(verdict.valid, false);
    assert.equal(verdict.violations[0].code, "item-unavailable");
  });

  it("reports every violation at once rather than the first", () => {
    const verdict = check(["fop_nope", "fop_bacon", "fop_cheese", "fop_gone"]);
    const codes = verdict.violations.map((violation) => violation.code);
    assert.ok(codes.includes("unknown-option"));
    assert.ok(codes.includes("min-selections"), "the size group is still empty");
  });

  it("returns only the ids it accepted, so a caller cannot price a rejected option", () => {
    const verdict = check(["fop_large", "fop_nope"]);
    assert.deepEqual(verdict.selected, ["fop_large"]);
  });
});
