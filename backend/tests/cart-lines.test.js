/**
 * cart-lines.test.js — module 6's rules, with no PostgreSQL at all.
 *
 * `availability.js` and `options.js` got `menu-rules.test.js` for the same
 * reason: the decisions that need no row are cheaper and clearer to state as
 * facts about functions, and what is left for `cart.test.js` is precisely what a
 * function call cannot exercise — ownership, transactions and the wire.
 *
 * The line id is most of this file, because it is most of the design.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LINE_ID_MAX_LENGTH,
  canonicalOptionIds,
  cartTotals,
  dec,
  isDigestedLineId,
  lineTotal,
  lineUnitPrice,
  makeLineId,
} from "../src/modules/cart/lines.js";

const FOOD = "food_01J8ZQ4W5N6P7R8S9T0V1W2X3Y";
const optionId = (n) => `fop_01J8ZQ4W5N6P7R8S9T0V1W2X${String(n).padStart(2, "0")}`;

describe("cart line identity", () => {
  it("is the food id when nothing was chosen", () => {
    assert.equal(makeLineId(FOOD, []), FOOD);
  });

  it("appends the chosen option ids", () => {
    assert.equal(makeLineId(FOOD, ["fop_a"]), `${FOOD}|fop_a`);
  });

  it("does not depend on the order the customer clicked", () => {
    // The whole reason `lib/cart.ts::makeLineId` sorts: a burger is a burger
    // whether the cheese or the bacon box was ticked first.
    assert.equal(makeLineId(FOOD, ["fop_b", "fop_a"]), makeLineId(FOOD, ["fop_a", "fop_b"]));
  });

  it("does not depend on a repeated id either", () => {
    assert.equal(makeLineId(FOOD, ["fop_a", "fop_a"]), makeLineId(FOOD, ["fop_a"]));
  });

  it("separates two different selections of the same dish", () => {
    // Burger + cheese and burger without cheese are two lines, not one — §8.
    assert.notEqual(makeLineId(FOOD, ["fop_cheese"]), makeLineId(FOOD, []));
    assert.notEqual(makeLineId(FOOD, ["fop_cheese"]), makeLineId(FOOD, ["fop_bacon"]));
  });

  it("separates two dishes with the same selection", () => {
    assert.notEqual(makeLineId("food_a", ["fop_x"]), makeLineId("food_b", ["fop_x"]));
  });

  it("never exceeds the column width, however many modifiers were chosen", () => {
    for (const count of [0, 1, 2, 3, 5, 12, 40]) {
      const ids = Array.from({ length: count }, (_, index) => optionId(index));
      const lineId = makeLineId(FOOD, ids);
      assert.ok(lineId.length <= LINE_ID_MAX_LENGTH, `${count} options → ${lineId.length} chars`);
    }
  });

  it("keeps the readable form while it fits", () => {
    // Two minted modifiers fit in 120 characters; the third is what overflows.
    assert.equal(isDigestedLineId(makeLineId(FOOD, [optionId(1), optionId(2)])), false);
    assert.equal(isDigestedLineId(makeLineId(FOOD, [optionId(1), optionId(2), optionId(3)])), true);
  });

  it("the overflow form is still a function of the selection alone", () => {
    const ids = [optionId(1), optionId(2), optionId(3), optionId(4)];
    assert.equal(makeLineId(FOOD, ids), makeLineId(FOOD, [...ids].reverse()));
    assert.notEqual(makeLineId(FOOD, ids), makeLineId(FOOD, ids.slice(1)));
  });

  it("the overflow form still names the dish, so a line is traceable without a join", () => {
    const ids = Array.from({ length: 6 }, (_, index) => optionId(index));
    assert.ok(makeLineId(FOOD, ids).startsWith(`${FOOD}|~`));
  });

  it("canonical option ids are de-duplicated, sorted and free of blanks", () => {
    assert.deepEqual(canonicalOptionIds(["b", "a", "b", "", null, undefined]), ["a", "b"]);
  });
});

describe("cart arithmetic", () => {
  it("a unit price is the base plus every delta", () => {
    assert.equal(lineUnitPrice(720, [120]).toString(), "840");
    assert.equal(lineUnitPrice(500, [50, 25, -75]).toString(), "500");
  });

  it("adds money in Decimal, not in float", () => {
    // The reason `lines.js` is not written with `+`: this line is stored and read
    // again at checkout, and `0.1 + 0.2` is `0.30000000000000004` in JavaScript.
    assert.equal(lineUnitPrice(0.1, [0.2]).toString(), "0.3");
    assert.equal(cartTotals([{ unitPrice: "0.1", quantity: 1 }, { unitPrice: "0.2", quantity: 1 }]).subtotal.toString(), "0.3");
  });

  it("a line total multiplies by quantity", () => {
    assert.equal(lineTotal("840", 2).toString(), "1680");
  });

  it("a cart's subtotal and count are the two sums", () => {
    const totals = cartTotals([
      { unitPrice: "840", quantity: 2 },
      { unitPrice: "300", quantity: 3 },
    ]);
    assert.equal(totals.subtotal.toString(), "2580");
    assert.equal(totals.count, 5);
    assert.equal(totals.lineCount, 2);
  });

  it("an empty basket is zero, not null", () => {
    const totals = cartTotals([]);
    assert.equal(totals.subtotal.toString(), "0");
    assert.equal(totals.count, 0);
  });

  it("dec takes a Decimal, a number, a string or nothing", () => {
    assert.equal(dec(null).toString(), "0");
    assert.equal(dec(1.5).toString(), "1.5");
    assert.equal(dec("2.25").toString(), "2.25");
    assert.equal(dec(dec("3")).toString(), "3");
  });
});
