import type { Type } from '@nestjs/common';
import { Field, InterfaceType, ObjectType } from '@nestjs/graphql';

import { JSONObjectScalar } from '../common/scalars';
import type { Result } from '../shared/kernel';

/**
 * The wire form of `frontend/services/http.ts::Result<T>` (D5 §Payload types).
 *
 * Every mutation returns one of these rather than a bare entity, which is what
 * lets an *expected* refusal — bad credentials, an ineligible coupon, a table
 * taken while the form was open — arrive as data at HTTP 200 instead of as an
 * exception. The frontend has rendered `error` as an i18n key since Phase C, so
 * a service function keeps its `Promise<Result<T>>` signature and its body
 * becomes a two-line map.
 */
@ObjectType({ description: 'An expected refusal, carried as data rather than thrown.' })
export class UserError {
  @Field(() => String, {
    description: 'i18n key, e.g. "errors.invalidCredentials". Never prose.',
  })
  key!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Field path for a form error, e.g. "input.phone".',
  })
  path?: string | null;

  @Field(() => JSONObjectScalar, {
    nullable: true,
    description: 'ICU parameters the message needs, e.g. { min: 250 }.',
  })
  params?: Record<string, unknown> | null;
}

@InterfaceType({ description: 'Implemented by every mutation payload.' })
export abstract class MutationPayload {
  @Field(() => Boolean)
  success!: boolean;

  @Field(() => UserError, { nullable: true })
  error?: UserError | null;
}

/**
 * A payload with no data — `logout`, `requestPasswordReset`. The absence of a
 * `data` field is the honest shape: these succeed or refuse, they do not return
 * anything.
 */
@ObjectType({ implements: () => [MutationPayload] })
export class MutationResult implements MutationPayload {
  @Field(() => Boolean) success!: boolean;
  @Field(() => UserError, { nullable: true }) error?: UserError | null;
}

export interface DataPayload<T> extends MutationPayload {
  data?: T | null;
}

/**
 * Mints `type XPayload implements MutationPayload { success, error, data: X }`.
 *
 * Code-first has no generics on the wire, so each payload has to be a distinct
 * named type. Writing thirty of them by hand would be thirty chances to forget
 * `success` or to name the data field differently; this makes the shape
 * structural.
 */
export function payloadOf<T>(dataType: Type<T>, name: string, description?: string) {
  @ObjectType(name, { description, implements: () => [MutationPayload] })
  class Payload implements DataPayload<T> {
    @Field(() => Boolean) success!: boolean;
    @Field(() => UserError, { nullable: true }) error?: UserError | null;
    @Field(() => dataType, { nullable: true }) data?: T | null;
  }
  return Payload;
}

/** `Result<T>` → the payload shape. The whole mapping, in one place. */
export function toPayload<T>(result: Result<T>): DataPayload<T> {
  return result.ok
    ? { success: true, error: null, data: result.data }
    : {
        success: false,
        data: null,
        error: { key: result.error.key, path: result.error.path, params: result.error.params },
      };
}

/** Same, for the mutations that carry no data. */
export function toResult(result: Result<unknown>): MutationResult {
  return result.ok
    ? { success: true, error: null }
    : {
        success: false,
        error: { key: result.error.key, path: result.error.path, params: result.error.params },
      };
}
