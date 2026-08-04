import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

import { DateTimeScalar, MoneyScalar } from '../../../../common/scalars';
import { payloadOf } from '../../../../graphql';

/**
 * The GraphQL surface of the cart.
 *
 * Field for field `frontend/types/cart.ts`, in the same order, for the same reason as the
 * catalog's models: the frontend's types are the contract, and this is the side that has
 * to bend. `CartVendor` and `CartSelectedOption` keep their names from that file even
 * where a fresh design would choose others, because a rename here is a rename in every
 * component that touches a basket.
 */

@ObjectType('CartVendor', {
  description: 'Vendor snapshot the cart carries. `frontend/types/cart.ts::CartVendor`.',
})
export class CartVendorModel {
  @Field(() => ID) id!: string;
  @Field(() => String) slug!: string;
  @Field(() => String) name!: string;
  @Field(() => String, { description: 'ISO 4217. Every Money field below is in it.' })
  currency!: string;

  @Field(() => String, {
    description: 'Vendor country — drives the tax rate at checkout, which Unit 2 does not compute.',
  })
  countryCode!: string;

  @Field(() => MoneyScalar) deliveryFee!: number;
  @Field(() => MoneyScalar) minOrder!: number;
  @Field(() => MoneyScalar, { nullable: true }) freeDeliveryOver!: number | null;
}

@ObjectType('CartSelectedOption', {
  description: 'A chosen variant or add-on, snapshotted so the line is self-contained.',
})
export class CartSelectedOptionModel {
  @Field(() => ID) groupId!: string;
  @Field(() => ID) optionId!: string;
  @Field(() => String) name!: string;
  @Field(() => MoneyScalar) priceDelta!: number;
}

@ObjectType('CartLine', { description: 'One configured dish. `types/cart.ts::CartLine`.' })
export class CartLineModel {
  @Field(() => ID, {
    description:
      'Composite: food id + sorted option ids, so identical configurations merge. ' +
      'Computed by the server; a client-supplied id is ignored.',
  })
  id!: string;

  @Field(() => ID) foodId!: string;
  @Field(() => String) name!: string;
  @Field(() => String) image!: string;

  @Field(() => MoneyScalar, { description: 'The dish price when it went in — a snapshot, not a lookup.' })
  basePrice!: number;

  @Field(() => MoneyScalar, { description: 'basePrice + Σ option deltas.' })
  unitPrice!: number;

  @Field(() => Int) quantity!: number;
  @Field(() => [CartSelectedOptionModel]) options!: CartSelectedOptionModel[];
}

@ObjectType('Cart')
export class CartModel {
  @Field(() => ID) id!: string;
  @Field(() => CartVendorModel) vendor!: CartVendorModel;
  @Field(() => [CartLineModel]) lines!: CartLineModel[];

  @Field(() => MoneyScalar, { description: 'Σ unitPrice × quantity.' })
  subtotal!: number;

  @Field(() => MoneyScalar, {
    description:
      "The vendor's fee after its free-delivery threshold. NOT a checkout total — no tax, " +
      'coupon or tip is applied until the checkout unit exists.',
  })
  deliveryFee!: number;

  @Field(() => Int, { description: 'Total units across all lines — the header badge.' })
  count!: number;

  @Field(() => DateTimeScalar) updatedAt!: Date;
}

/**
 * `data: null` on success is meaningful here rather than a failure: removing the last line
 * or clearing the basket leaves *no cart*, which is exactly what `stores/cart.ts` shows —
 * `vendor: null, lines: []`. An empty cart still pinned to a restaurant would silently
 * block the next add from anywhere else.
 */
export const CartPayload = payloadOf(CartModel, 'CartPayload');
