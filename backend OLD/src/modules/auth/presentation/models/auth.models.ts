import { Field, Int, ObjectType } from '@nestjs/graphql';

import { DateTimeScalar } from '../../../../common/scalars';
import { payloadOf, SessionRevokeReasonScalar, DevicePlatformScalar } from '../../../../graphql';
import type { DevicePlatform, SessionRevokeReason } from '../../../../shared/enums';
import { User } from '../../../../graphql';

/**
 * What a successful sign-in returns.
 *
 * **The refresh token is not here.** It leaves only as an `httpOnly` cookie scoped to
 * `/auth`, so JavaScript cannot read it and the browser will not send it to
 * `/graphql` at all — which is what makes the GraphQL endpoint non-cookie-authenticated
 * and therefore not CSRF-able (D6 §Cookies). Putting it in the response body would
 * undo every one of those properties in exchange for nothing.
 *
 * The access token *is* here, because it is meant to live in memory: it is short-lived,
 * it is sent as `Authorization: Bearer`, and a client that persists it has made a
 * choice this API cannot prevent but does not encourage.
 */
@ObjectType({ description: 'A signed-in session. The refresh token travels as an httpOnly cookie.' })
export class AuthSession {
  @Field(() => User) user!: User;

  @Field(() => String, { description: 'Send as `Authorization: Bearer`. Keep in memory.' })
  accessToken!: string;

  @Field(() => DateTimeScalar, {
    description: 'When to refresh. The client should renew before this, not after a 401.',
  })
  accessTokenExpiresAt!: Date;

  @Field(() => String, { description: 'This sign-in — what "sign out this device" acts on.' })
  sessionId!: string;
}

export const AuthPayload = payloadOf(AuthSession, 'AuthPayload', 'Result<AuthSession>.');

@ObjectType({ description: 'A one-time code in flight. The code itself is never returned.' })
export class OtpChallengeView {
  @Field(() => String, { description: 'Normalised — the form of the number the server stored.' })
  destination!: string;

  @Field(() => DateTimeScalar) expiresAt!: Date;

  @Field(() => Int, {
    description: 'Seconds until a resend is allowed. The same number the server enforces.',
  })
  resendAfterSeconds!: number;
}

export const OtpPayload = payloadOf(OtpChallengeView, 'OtpPayload', 'Result<OtpChallengeView>.');

/**
 * One row of the account's security screen.
 *
 * Deliberately says nothing that would help someone who already has access: no token,
 * no full user agent, and the IP only because "signed in from an address you don't
 * recognise" is the entire point of the screen.
 */
@ObjectType({ description: 'A live sign-in on one device.' })
export class SessionView {
  @Field(() => String) id!: string;
  @Field(() => Boolean, { description: 'True for the session making this request.' })
  isCurrent!: boolean;

  @Field(() => DevicePlatformScalar, { nullable: true }) platform!: DevicePlatform | null;
  @Field(() => String, { nullable: true }) deviceName!: string | null;
  @Field(() => String, { nullable: true }) location!: string | null;
  @Field(() => String, { nullable: true }) ip!: string | null;

  @Field(() => DateTimeScalar) createdAt!: Date;
  @Field(() => DateTimeScalar) lastSeenAt!: Date;
  @Field(() => DateTimeScalar) expiresAt!: Date;

  @Field(() => SessionRevokeReasonScalar, { nullable: true })
  revokeReason!: SessionRevokeReason | null;
}
