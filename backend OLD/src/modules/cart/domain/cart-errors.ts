/**
 * The cart's expected refusals, as i18n keys.
 *
 * Every one of these is a thing a customer can legitimately cause by clicking, which is
 * why they travel as `UserError` data at HTTP 200 rather than as thrown exceptions. The
 * dividing line: a dish that has just sold out is a refusal, a `foodId` that is not a
 * string is a validation error, and a database that is down is an exception.
 */
export const CartError = {
  /** No such dish, or it is deleted. Not distinguished — both are "gone". */
  foodNotFound: 'cart.errors.foodNotFound',
  /** The dish exists but its vendor is suspended or has no primary branch. */
  vendorUnavailable: 'cart.errors.vendorUnavailable',
  /** The kitchen marked it out of stock while the sheet was open. */
  itemUnavailable: 'cart.errors.itemUnavailable',
  /**
   * The dish belongs to a different vendor than the live cart.
   *
   * The client asks first and then re-sends with `replaceExisting` — that is the "start a
   * new cart?" prompt Phase C already ships. The server still refuses by default rather
   * than trusting the client to have asked, because a cart holding two vendors' dishes
   * cannot be delivered and would be discovered at checkout.
   */
  vendorConflict: 'cart.errors.vendorConflict',
  /** An option id that is not on this dish. */
  unknownOption: 'cart.errors.unknownOption',
  /** The same option twice in one line. */
  duplicateOption: 'cart.errors.duplicateOption',
  /** A required group with nothing chosen, or fewer than its minimum. */
  optionGroupRequired: 'cart.errors.optionGroupRequired',
  /** More choices than the group's maximum. */
  tooManyOptions: 'cart.errors.tooManyOptions',
  /** Quantity outside 1…`CART_MAX_LINE_QUANTITY`. */
  invalidQuantity: 'cart.errors.invalidQuantity',
  /** `CART_MAX_LINES` distinct configurations already in the basket. */
  cartFull: 'cart.errors.cartFull',
  /** No cart, or not this owner's — the two are deliberately indistinguishable. */
  cartNotFound: 'cart.errors.cartNotFound',
  /** No such line in this cart. */
  lineNotFound: 'cart.errors.lineNotFound',
  /**
   * The composite line id would exceed `cart_items.id`'s 120 characters.
   *
   * Only reachable by choosing a great many add-ons on a dish with long ids. Hashing the
   * id would remove the limit and would also desynchronise the frontend, which builds the
   * same id with the same algorithm so that identical configurations merge on both sides.
   * A refusal that names the cause beats a basket whose lines silently stop merging.
   */
  lineTooComplex: 'cart.errors.lineTooComplex',
} as const;

export type CartErrorKey = (typeof CartError)[keyof typeof CartError];
