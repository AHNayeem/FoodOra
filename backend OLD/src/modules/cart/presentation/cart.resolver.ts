import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { Actor } from '../../../common/context';
import { CurrentUser, Public } from '../../../common/decorators';
import { DomainError, ErrorCode } from '../../../common/errors';
import { zodPipe } from '../../../common/pipes';
import { type DataPayload, MutationResult, toPayload, toResult } from '../../../graphql';
import { CartService } from '../application/cart.service';
import type { CartOwner, CartRecord } from '../domain';
import {
  AddToCartInput,
  AddToCartSchema,
  RemoveCartItemInput,
  RemoveCartItemSchema,
  UpdateCartItemInput,
  UpdateCartItemSchema,
} from './inputs/cart.inputs';
import { CartModel, CartPayload } from './models/cart.models';

/**
 * The cart's five operations.
 *
 * ## Why every one of these is `@Public()`
 *
 * Because a shopping basket predates a customer. Phase C lets an anonymous visitor browse,
 * configure a dish and fill a cart, and only asks who they are at checkout — which is how
 * food delivery works everywhere, and abandoning it to make the server's life easier would
 * be a product change dressed as an implementation detail.
 *
 * `@Public()` here does **not** mean unowned. Every operation resolves an owner first, and
 * the resolution is the security boundary:
 *
 * - authenticated → the actor's id, from the guard's resolved actor, never from an argument;
 * - anonymous → the `guestKey` in the input, which must be at least 16 url-safe characters.
 *
 * The precedence matters and runs one way only: **a signed-in request ignores `guestKey`
 * entirely.** If the key could override the actor, anyone could read anyone else's basket
 * by sending a key they had seen; if it merely supplemented the actor, a customer signing
 * in on a second device would find their cart empty because the key came from the first
 * browser.
 *
 * A request with neither is refused with `UNAUTHENTICATED` rather than handed an empty
 * cart, because "you did not say who you are" and "your basket is empty" are different
 * facts and a client that confuses them will silently drop a customer's order.
 *
 * ## Why there is no `mergeGuestCart`
 *
 * There should be, and its absence is a known gap rather than a decision: signing in with
 * a guest basket currently leaves that basket behind the guest key. Adopting it is five
 * lines here and a policy question about what happens when the account already has a cart
 * for another vendor — which is the vendor-conflict prompt again, now with no user in front
 * of it to answer. That belongs with checkout, which is the first operation that genuinely
 * requires an account.
 */
@Resolver()
export class CartResolver {
  constructor(private readonly carts: CartService) {}

  @Public()
  @Query(() => CartModel, {
    name: 'myCart',
    nullable: true,
    description:
      'The current basket, or null when there is none. `frontend/stores/cart.ts` hydrates from this.',
  })
  async myCart(
    @CurrentUser() actor: Actor | undefined,
    @Args('guestKey', { type: () => String, nullable: true }) guestKey?: string,
  ): Promise<CartRecord | null> {
    return this.carts.currentCart(this.owner(actor, guestKey));
  }

  @Public()
  @Mutation(() => CartPayload, {
    description: 'Add a configured dish. `frontend/stores/cart.ts::add`.',
  })
  async addToCart(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(AddToCartSchema)) input: AddToCartInput,
  ): Promise<DataPayload<CartRecord>> {
    const result = await this.carts.addItem(
      this.owner(actor, input.guestKey),
      { foodId: input.foodId, optionIds: input.optionIds ?? [], quantity: input.quantity },
      input.replaceExisting,
    );
    return toPayload(result);
  }

  @Public()
  @Mutation(() => CartPayload, {
    description:
      'Set a line’s quantity; zero removes it. `data` is null when that emptied the cart. ' +
      '`frontend/stores/cart.ts::setQuantity`.',
  })
  async updateCartItem(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(UpdateCartItemSchema)) input: UpdateCartItemInput,
  ): Promise<DataPayload<CartRecord | null>> {
    const result = await this.carts.updateQuantity(
      this.owner(actor, input.guestKey),
      input.lineId,
      input.quantity,
    );
    return toPayload(result);
  }

  @Public()
  @Mutation(() => CartPayload, {
    description: 'Remove a line. `frontend/stores/cart.ts::removeLine`.',
  })
  async removeCartItem(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(RemoveCartItemSchema)) input: RemoveCartItemInput,
  ): Promise<DataPayload<CartRecord | null>> {
    const result = await this.carts.removeItem(this.owner(actor, input.guestKey), input.lineId);
    return toPayload(result);
  }

  /**
   * Empties the basket. A `MutationResult` rather than a `CartPayload`, because the honest
   * answer is that there is nothing left to return — and mapping the `null` to an empty
   * cart object would be inventing a basket to describe its absence.
   */
  @Public()
  @Mutation(() => MutationResult, {
    description: 'Empty the cart. Idempotent. `frontend/stores/cart.ts::clear`.',
  })
  async clearCart(
    @CurrentUser() actor: Actor | undefined,
    @Args('guestKey', { type: () => String, nullable: true }) guestKey?: string,
  ): Promise<MutationResult> {
    return toResult(await this.carts.clearCart(this.owner(actor, guestKey)));
  }

  /**
   * Actor first, guest key second, never both — see the class comment.
   *
   * This throws rather than returning a refusal payload, and the distinction is the one
   * D5 draws: a missing owner is not something the customer can act on, it is a client
   * that failed to send a key it is responsible for generating.
   */
  private owner(actor: Actor | undefined, guestKey: string | undefined): CartOwner {
    if (actor) return { userId: actor.id, guestKey };
    if (guestKey) return { guestKey };

    throw new DomainError(
      ErrorCode.UNAUTHENTICATED,
      'errors.cartOwnerRequired',
      {
        cause: new Error(
          'A cart operation needs either an authenticated actor or a guestKey. Anonymous ' +
            'clients generate one and persist it beside the cart — see frontend/lib/cart-key.ts.',
        ),
      },
    );
  }
}
