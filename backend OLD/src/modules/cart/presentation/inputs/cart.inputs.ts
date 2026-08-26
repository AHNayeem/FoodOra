import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { z } from 'zod';

/**
 * The cart's inputs — and a study in what a client is *not* allowed to say.
 *
 * There is no `unitPrice`, no `basePrice`, no option `name` and no `priceDelta` anywhere
 * in this file, even though every one of them is a field on `CartLine` and the frontend
 * already knows all of them. They are absent because a mutation argument is an assertion
 * the server has to either trust or check, and for money the honest answer is that it
 * should never have been asked. The client says *which dish* and *which options*; the
 * server says what that costs.
 *
 * `guestKey` is the exception that proves the rule: it is client-supplied and trusted,
 * because possession of it is the entire claim to an anonymous basket — the same bargain
 * as a session cookie. Its length floor is what makes it unguessable, and the schema is
 * where that floor is enforced.
 */

/** Roughly the entropy of a UUID, minus the formatting. */
const guestKey = z
  .string()
  .trim()
  .min(16, 'a guest key shorter than this is guessable')
  .max(60)
  .regex(/^[A-Za-z0-9_-]+$/, 'expected an opaque url-safe token');

@InputType({ description: 'Add a configured dish to the cart.' })
export class AddToCartInput {
  @Field(() => ID) foodId!: string;

  @Field(() => [ID], {
    nullable: true,
    description:
      'Chosen variant and add-on ids, in any order. Validated against the dish’s real ' +
      'option groups; names and prices are read from the database, never from here.',
  })
  optionIds?: string[];

  @Field(() => Int, { defaultValue: 1 }) quantity!: number;

  @Field(() => Boolean, {
    defaultValue: false,
    description:
      'Discard the existing basket when this dish belongs to a different vendor. The ' +
      'client sets it only after the customer has answered the "start a new cart?" prompt.',
  })
  replaceExisting!: boolean;

  @Field(() => String, {
    nullable: true,
    description:
      'Identifies an anonymous basket. Ignored when the request is authenticated — a ' +
      'signed-in customer’s cart is keyed by their user id on every device.',
  })
  guestKey?: string;
}

@InputType({ description: 'Set a line’s quantity. Zero removes the line.' })
export class UpdateCartItemInput {
  @Field(() => ID, { description: 'The composite line id from `CartLine.id`.' })
  lineId!: string;

  @Field(() => Int) quantity!: number;

  @Field(() => String, { nullable: true }) guestKey?: string;
}

@InputType()
export class RemoveCartItemInput {
  @Field(() => ID) lineId!: string;
  @Field(() => String, { nullable: true }) guestKey?: string;
}

export const AddToCartSchema = z.object({
  foodId: z.string().trim().min(1).max(40),
  /**
   * Twenty is not a guess about UI; it is `cart_items.id` arithmetic. The line id is the
   * food id plus every option id joined by `|` and the column is 120 characters, so a
   * request with dozens of options cannot produce a storable line. Refusing here gives a
   * clear message; refusing later gives a truncated id that merges two different dinners.
   */
  optionIds: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  quantity: z.number().int().min(1).max(999),
  replaceExisting: z.boolean(),
  guestKey: guestKey.optional(),
});

export const UpdateCartItemSchema = z.object({
  lineId: z.string().trim().min(1).max(120),
  // Zero is allowed and means "remove", which is what `stores/cart.ts::setQuantity` does
  // when the stepper reaches the bottom. The upper bound belongs to config, so this only
  // rejects the absurd; `CartService` applies `CART_MAX_LINE_QUANTITY`.
  quantity: z.number().int().min(0).max(999),
  guestKey: guestKey.optional(),
});

export const RemoveCartItemSchema = z.object({
  lineId: z.string().trim().min(1).max(120),
  guestKey: guestKey.optional(),
});

export const GuestKeySchema = guestKey.optional();
