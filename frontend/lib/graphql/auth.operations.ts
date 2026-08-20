import { gql, type TypedDocumentNode } from "@apollo/client";

import type { User } from "@/types";
import type { MutationPayloadLike } from "./result";

/**
 * The auth documents, and the wire types that go with them.
 *
 * Apollo v4 infers a mutation's result from the document, so an untyped
 * `DocumentNode` types `data` as `{}` and every field access is an error. Each
 * document is therefore declared as a `TypedDocumentNode<Data, Variables>`,
 * hand-written to match the selection set below. There is no codegen step in this
 * repo yet; if the number of operations grows past a screenful,
 * `@graphql-codegen/client-preset` reading `backend/schema.gql` is the answer, and
 * these declarations are exactly what it would emit.
 *
 * `USER_FIELDS` selects exactly `types/user.ts::User` and nothing else. The GraphQL
 * type has one extra field (`status`) which is deliberately left unselected: the
 * read model the components consume has not changed, so neither should what the
 * client asks for. When a screen needs `status`, the selection set grows and the
 * type gains a field — additively, in that order.
 *
 * `DateTime` serialises as an ISO-8601 string, which is what `ISODate` already is,
 * so nothing is remapped on arrival.
 */

/** `AuthSession` — what a successful sign-in returns. The refresh token is not in it. */
export interface AuthSessionData {
  accessToken: string;
  accessTokenExpiresAt: string;
  sessionId: string;
  user: User;
}

export interface OtpChallengeData {
  destination: string;
  expiresAt: string;
  resendAfterSeconds: number;
}

interface DeviceInput {
  installId?: string;
  platform?: string;
  name?: string;
  model?: string;
  appVersion?: string;
  pushToken?: string;
}

export const USER_FIELDS = gql`
  fragment UserFields on User {
    id
    name
    email
    phone
    avatar
    role
    permissions
    countryCode
    currency
    locale
    isVerified
    createdAt
    updatedAt
    deletedAt
  }
`;

/** Shared by `login`, `register` and `verifyOtp` — all three return `AuthPayload`. */
const AUTH_PAYLOAD_FIELDS = gql`
  ${USER_FIELDS}
  fragment AuthPayloadFields on AuthPayload {
    success
    error {
      key
      path
    }
    data {
      accessToken
      accessTokenExpiresAt
      sessionId
      user {
        ...UserFields
      }
    }
  }
`;

export const LOGIN: TypedDocumentNode<
  { login: MutationPayloadLike<AuthSessionData> },
  {
    input: {
      email: string;
      password: string;
      rememberMe: boolean;
      device?: DeviceInput;
    };
  }
> = gql`
  ${AUTH_PAYLOAD_FIELDS}
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      ...AuthPayloadFields
    }
  }
`;

export const REGISTER: TypedDocumentNode<
  { register: MutationPayloadLike<AuthSessionData> },
  {
    input: {
      name: string;
      email: string;
      phone?: string;
      password: string;
      // Phase 7 (G10) added the rider role; the API's `RegisterInput` enum
      // carries the same three, and `services/auth.RegisterInput` is the source.
      role: "customer" | "restaurant-owner" | "delivery-rider";
      marketingOptIn: boolean;
      device?: DeviceInput;
    };
  }
> = gql`
  ${AUTH_PAYLOAD_FIELDS}
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      ...AuthPayloadFields
    }
  }
`;

export const VERIFY_OTP: TypedDocumentNode<
  { verifyOtp: MutationPayloadLike<AuthSessionData> },
  {
    input: {
      destination: string;
      code: string;
      channel: "sms" | "email" | "whatsapp";
      purpose: "login" | "register" | "verify-phone" | "reset-password";
      device?: DeviceInput;
    };
  }
> = gql`
  ${AUTH_PAYLOAD_FIELDS}
  mutation VerifyOtp($input: VerifyOtpInput!) {
    verifyOtp(input: $input) {
      ...AuthPayloadFields
    }
  }
`;

export const REQUEST_OTP: TypedDocumentNode<
  { requestOtp: MutationPayloadLike<OtpChallengeData> },
  {
    input: {
      destination: string;
      channel: "sms" | "email" | "whatsapp";
      purpose: "login" | "register" | "verify-phone" | "reset-password";
    };
  }
> = gql`
  mutation RequestOtp($input: RequestOtpInput!) {
    requestOtp(input: $input) {
      success
      error {
        key
      }
      data {
        destination
        expiresAt
        resendAfterSeconds
      }
    }
  }
`;

export const REQUEST_PASSWORD_RESET: TypedDocumentNode<
  { requestPasswordReset: MutationPayloadLike<never> },
  { email: string }
> = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) {
      success
      error {
        key
      }
    }
  }
`;

export const LOGOUT: TypedDocumentNode<
  { logout: MutationPayloadLike<never> },
  { allDevices: boolean }
> = gql`
  mutation Logout($allDevices: Boolean!) {
    logout(allDevices: $allDevices) {
      success
      error {
        key
      }
    }
  }
`;

export const ME: TypedDocumentNode<{ me: User }, Record<string, never>> = gql`
  ${USER_FIELDS}
  query Me {
    me {
      ...UserFields
    }
  }
`;
