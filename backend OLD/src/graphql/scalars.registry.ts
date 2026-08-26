import type { GraphQLScalarType } from 'graphql';

import { baseScalars, createEnumScalar } from '../common/scalars';
import {
  COUPON_KINDS,
  type CouponKind,
  DEVICE_PLATFORMS,
  type DevicePlatform,
  DIETARY_TAGS,
  type DietaryTag,
  FULFILLMENT_TYPES,
  type FulfillmentType,
  NOTIFICATION_TOPICS,
  type NotificationTopic,
  ORDER_ACTORS,
  type OrderActor,
  ORDER_CANCEL_REASONS,
  type OrderCancelReason,
  ORDER_STATUSES,
  type OrderStatus,
  OTP_CHANNELS,
  type OtpChannel,
  OTP_PURPOSES,
  type OtpPurpose,
  PAYMENT_METHODS,
  type PaymentMethod,
  PAYMENT_STATUSES,
  type PaymentStatus,
  REFUND_STATUSES,
  type RefundStatus,
  SERVICE_STATUSES,
  type ServiceStatus,
  SESSION_REVOKE_REASONS,
  type SessionRevokeReason,
  SETTING_SCOPES,
  type SettingScope,
  SETTING_VALUE_TYPES,
  type SettingValueType,
  TEXT_DIRECTIONS,
  type TextDirection,
  USER_ROLES,
  type UserRole,
  USER_STATUSES,
  type UserStatus,
  VENDOR_SORTS,
  VENDOR_TYPES,
  type VendorSort,
  type VendorType,
} from '../shared/enums';

/**
 * Where a pure vocabulary from `shared/enums` becomes something GraphQL can
 * serialise.
 *
 * Kept apart from the vocabularies themselves so a domain file can import
 * `OrderStatus` without importing `graphql` — the dependency rule, enforced by
 * ESLint, is what keeps `domain/` unit-testable with no container and no
 * schema.
 *
 * As each module lands, its vocabulary is minted here. One file to read to know
 * every scalar the API speaks.
 *
 * `scalarRegistry` is the catalogue, **not** a driver `resolvers` map — that is
 * SDL-first wiring, and in code-first a scalar reaches the schema by being
 * referenced from a `@Field(() => …)`. Listing an unreferenced one would fail
 * schema assembly outright.
 */
// --- E1 --------------------------------------------------------------------
export const ServiceStatusScalar = createEnumScalar<ServiceStatus>(
  'ServiceStatus',
  SERVICE_STATUSES,
  'Health of a dependency.',
);

// --- E2: identity ----------------------------------------------------------
export const UserRoleScalar = createEnumScalar<UserRole>(
  'UserRole',
  USER_ROLES,
  'A role slug, identical to frontend/types/user.ts::UserRole. Kebab-case, which is exactly why it is a scalar and not a GraphQL enum.',
);

export const UserStatusScalar = createEnumScalar<UserStatus>(
  'UserStatus',
  USER_STATUSES,
  'Account standing. Only suspended and banned stop a token from being honoured.',
);

export const OtpPurposeScalar = createEnumScalar<OtpPurpose>(
  'OtpPurpose',
  OTP_PURPOSES,
  'What a one-time code is for — part of the challenge’s identity, not a label on it.',
);

export const OtpChannelScalar = createEnumScalar<OtpChannel>(
  'OtpChannel',
  OTP_CHANNELS,
  'How a one-time code is delivered.',
);

export const DevicePlatformScalar = createEnumScalar<DevicePlatform>(
  'DevicePlatform',
  DEVICE_PLATFORMS,
  'Where a session was signed in from; also the push-registration platform.',
);

export const SessionRevokeReasonScalar = createEnumScalar<SessionRevokeReason>(
  'SessionRevokeReason',
  SESSION_REVOKE_REASONS,
  'Why a session ended. "rotation-reuse" means a refresh token was replayed.',
);

// --- E3: core modules ------------------------------------------------------
export const NotificationTopicScalar = createEnumScalar<NotificationTopic>(
  'NotificationTopic',
  NOTIFICATION_TOPICS,
  'A notification subject. camelCase, because the frontend uses these as object keys in `settings.notifications`.',
);

export const TextDirectionScalar = createEnumScalar<TextDirection>(
  'TextDirection',
  TEXT_DIRECTIONS,
  'Reading direction of a language — what the root layout puts in <html dir>.',
);

export const SettingScopeScalar = createEnumScalar<SettingScope>(
  'SettingScope',
  SETTING_SCOPES,
  'Which layer a setting was written at. Resolution is vendor → country → platform.',
);

export const SettingValueTypeScalar = createEnumScalar<SettingValueType>(
  'SettingValueType',
  SETTING_VALUE_TYPES,
  'How to read a setting’s JSON value. Declared by the catalogue, not by the writer.',
);

// --- V1 Unit 1: catalog ----------------------------------------------------
export const VendorTypeScalar = createEnumScalar<VendorType>(
  'VendorType',
  VENDOR_TYPES,
  'What kind of merchant a storefront is. Identical to frontend/types/common.ts::VendorType.',
);

export const DietaryTagScalar = createEnumScalar<DietaryTag>(
  'DietaryTag',
  DIETARY_TAGS,
  'A dietary claim on a vendor or a dish. Filterable, so it is data rather than prose in a description.',
);

export const VendorSortScalar = createEnumScalar<VendorSort>(
  'VendorSort',
  VENDOR_SORTS,
  'Ordering for a vendor list. "recommended" is featured first, then rating.',
);

// --- V1 Unit 3: checkout ---------------------------------------------------
export const OrderStatusScalar = createEnumScalar<OrderStatus>(
  'OrderStatus',
  ORDER_STATUSES,
  'Where an order got to. Lifecycle order, which is what drives the progress bar.',
);

export const OrderActorScalar = createEnumScalar<OrderActor>(
  'OrderActor',
  ORDER_ACTORS,
  'Who moved the order. A status alone cannot say who set it, which is what the timeline needs.',
);

export const FulfillmentTypeScalar = createEnumScalar<FulfillmentType>(
  'FulfillmentType',
  FULFILLMENT_TYPES,
  'How the order reaches the customer. "pickup" waives the delivery fee.',
);

export const PaymentMethodScalar = createEnumScalar<PaymentMethod>(
  'PaymentMethod',
  PAYMENT_METHODS,
  'Tender. `mfs` and `netbanking` exist in the schema; checkout accepts cash, card and wallet.',
);

export const PaymentStatusScalar = createEnumScalar<PaymentStatus>(
  'PaymentStatus',
  PAYMENT_STATUSES,
  'Where the money is. Cash stays `pending` until the rider collects it.',
);

export const OrderCancelReasonScalar = createEnumScalar<OrderCancelReason>(
  'OrderCancelReason',
  ORDER_CANCEL_REASONS,
  'Why an order ended early. Maps onto the `order.reason.*` i18n messages.',
);

export const RefundStatusScalar = createEnumScalar<RefundStatus>(
  'RefundStatus',
  REFUND_STATUSES,
  'Where a refund on a cancelled or returned order got to.',
);

export const CouponKindScalar = createEnumScalar<CouponKind>(
  'CouponKind',
  COUPON_KINDS,
  'How a coupon’s discount is calculated. `cashback` moves no money at checkout.',
);

export const scalarRegistry: Record<string, GraphQLScalarType> = {
  ...baseScalars,
  CouponKind: CouponKindScalar,
  DevicePlatform: DevicePlatformScalar,
  DietaryTag: DietaryTagScalar,
  FulfillmentType: FulfillmentTypeScalar,
  OrderActor: OrderActorScalar,
  OrderCancelReason: OrderCancelReasonScalar,
  OrderStatus: OrderStatusScalar,
  PaymentMethod: PaymentMethodScalar,
  PaymentStatus: PaymentStatusScalar,
  RefundStatus: RefundStatusScalar,
  NotificationTopic: NotificationTopicScalar,
  OtpChannel: OtpChannelScalar,
  OtpPurpose: OtpPurposeScalar,
  ServiceStatus: ServiceStatusScalar,
  SessionRevokeReason: SessionRevokeReasonScalar,
  SettingScope: SettingScopeScalar,
  SettingValueType: SettingValueTypeScalar,
  TextDirection: TextDirectionScalar,
  UserRole: UserRoleScalar,
  UserStatus: UserStatusScalar,
  VendorSort: VendorSortScalar,
  VendorType: VendorTypeScalar,
};
