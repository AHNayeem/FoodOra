# D5 — GraphQL Architecture

Apollo Server 4 on NestJS, **code-first** (`@nestjs/graphql` decorators), schema
emitted to `backend/schema.gql` and committed so a diff is reviewable. GraphQL
Codegen turns that file into typed hooks for the frontend.

The governing constraint: **the wire shape must equal the shape
`frontend/services/*` already returns.** Swapping the seam means rewriting the
body of `getVendors()`, not its signature, and not the components above it.

## Enums — the one place naïve code-first would break the frontend

GraphQL enum values must match `/[_A-Za-z][_0-9A-Za-z]*/`. The frontend's unions
are kebab-case: `"cloud-kitchen"`, `"rider-assigned"`, `"free-delivery"`. A
native GraphQL enum therefore **cannot** carry them, and mapping
`CLOUD_KITCHEN ↔ "cloud-kitchen"` in the frontend would put a translation layer
in exactly the place this design exists to avoid.

So domain vocabularies are exposed as **validated custom scalars**, minted by
one factory:

```ts
// common/scalars/enum-scalar.factory.ts
export function createEnumScalar<T extends string>(name: string, values: readonly T[]) {
  const set = new Set<string>(values);
  return new GraphQLScalarType({
    name,
    description: `One of: ${values.join(' | ')}`,
    serialize: (v) => assertMember(v, set, name),
    parseValue: (v) => assertMember(v, set, name),
    parseLiteral: (ast) =>
      ast.kind === Kind.STRING ? assertMember(ast.value, set, name) : invalid(name),
  });
}

export const OrderStatusScalar = createEnumScalar('OrderStatus', ORDER_STATUSES);
```

The wire value is the frontend's string, verbatim; the server still rejects
anything outside the set; codegen emits the exact TypeScript union. The cost is
losing enum introspection in GraphiQL's autocomplete — the `description` lists
the members to compensate. Postgres keeps native enums underneath
(`@map`-ed labels), so storage integrity is unaffected.

Scalars: `DateTime` (ISO-8601 string, matching `ISODate`), `Money` (`Float`
serialised from `Decimal`), `JSONObject`, `Upload`, plus ~40 enum scalars.

## Schema shape

```graphql
type Query {
  # catalog
  cuisines: [Cuisine!]!
  categories: [Category!]!
  vendors(query: VendorQueryInput, page: PageInput): VendorPage!
  vendor(slug: String!): Vendor
  vendorMenu(vendorId: ID!): [MenuSectionWithItems!]!
  food(slug: String!): FoodItem
  trendingVendors(limit: Int = 8): [Vendor!]!
  featuredVendors(limit: Int = 6): [Vendor!]!

  # search
  search(query: SearchQueryInput): SearchResults!
  searchSuggestions(q: String!, limit: Int = 8): [String!]!

  # me
  me: User
  myOrders(page: PageInput): OrderPage!
  order(id: ID!): Order
  myAddresses: [SavedAddress!]!
  myWallet: Wallet!
  myCouponBook: CouponBook!
  mySubscriptions(page: PageInput): SubscriptionPage!
  myReservations(page: PageInput): ReservationPage!
  myReviews(page: PageInput): ReviewPage!
  myFavorites: FavoritesBoard!
  mySettings: CustomerSettings!
  notificationFeed(query: FeedQueryInput): NotificationFeed!

  # merchant
  vendorStats(vendorId: ID!): VendorStats!
  vendorOrders(vendorId: ID!, status: [OrderStatus!], page: PageInput): OrderPage!
  vendorRevenue(vendorId: ID!, days: Int = 7): [RevenuePoint!]!
  vendorHourly(vendorId: ID!): [HourlyPoint!]!
  vendorBestSellers(vendorId: ID!, limit: Int = 5): [BestSeller!]!
  vendorReviewBoard(vendorId: ID!, filter: ReviewFilterInput, page: PageInput): VendorReviewBoard!
  vendorCoupons(vendorId: ID!): VendorCouponBoard!
  reservationBook(vendorId: ID!, date: String!): ReservationBook!
  posCatalog(vendorId: ID!): [MenuSectionWithItems!]!

  # rider
  riderMe: Rider
  jobOffers(riderId: ID!): [DeliveryJob!]!
  riderJob(id: ID!): DeliveryJob
  riderDay(riderId: ID!): RiderDay!
  riderEarnings(riderId: ID!, range: EarningsRange!): RiderEarningsSummary!
  riderWallet(riderId: ID!): RiderWallet!

  # content / booking / verticals
  offers: OfferBoard!
  blogPosts(limit: Int, page: PageInput): BlogPostPage!
  blogPost(slug: String!): BlogPost
  legalDoc(slug: String!): LegalDoc
  cmsBanners(placement: CmsBannerPlacement!): [CmsBanner!]!
  cmsSite: CmsSite!
  cmsMenu(key: String!): [CmsMenuItem!]!
  routeMetadata(route: String!): CmsSeo!
  mealPlans(query: MealPlanQueryInput, page: PageInput): MealPlanPage!
  cateringServices(query: CateringQueryInput, page: PageInput): CateringServicePage!
  availability(vendorId: ID!, date: String!, partySize: Int!): DayAvailability!
  qrMenu(vendorSlug: String!, table: String): QrMenuView!

  # admin
  adminOrders(filter: AdminOrderFilter, page: PageInput): OrderPage!
  cmsCollections: [CmsCollectionSummary!]!
  cmsDocuments(collection: CmsCollectionId!, query: CmsListQueryInput): CmsDocumentPage!
  cmsDocument(id: ID!): CmsDocumentView
  auditLog(filter: AuditFilter, page: PageInput): AuditLogPage!
  featureFlags: [FeatureFlag!]!
}
```

Mutations follow one naming rule — `<verb><Aggregate>` — and every one returns a
**payload type**, never a bare entity, so a failure is data rather than an
exception:

```graphql
type Mutation {
  # auth
  login(input: LoginInput!): AuthPayload!
  register(input: RegisterInput!): AuthPayload!
  requestOtp(phone: String!): OtpPayload!
  verifyOtp(input: OtpVerifyInput!): AuthPayload!
  socialLogin(input: SocialLoginInput!): AuthPayload!
  refreshToken: AuthPayload!
  logout(allDevices: Boolean = false): MutationResult!
  requestPasswordReset(email: String!): MutationResult!

  # cart & checkout
  addToCart(input: AddToCartInput!): CartPayload!
  updateCartLine(input: UpdateCartLineInput!): CartPayload!
  applyCouponCode(code: String!): AppliedCouponPayload!
  placeOrder(input: PlaceOrderInput!): OrderPayload!
  authorisePayment(input: AuthorisePaymentInput!): PaymentPayload!
  cancelOrder(input: CancelOrderInput!): OrderPayload!
  verifyDeliveryOtp(input: VerifyOtpInput!): OrderPayload!

  # merchant
  acceptOrder(input: AcceptOrderInput!): OrderPayload!
  rejectOrder(input: RejectOrderInput!): OrderPayload!
  advanceOrder(input: AdvanceOrderInput!): OrderPayload!
  addOrderDelay(input: DelayOrderInput!): OrderPayload!
  upsertFood(input: FoodInput!): FoodPayload!
  setFoodAvailability(id: ID!, available: Boolean!): FoodPayload!
  completeSale(input: CompleteSaleInput!): PosSalePayload!
  replyToReview(input: ReplyInput!): ReviewPayload!
  createVendorCoupon(input: NewVendorCouponInput!): CouponPayload!

  # rider
  setShift(on: Boolean!): RiderPayload!
  acceptJob(jobId: ID!): JobPayload!
  declineJob(jobId: ID!, reason: String): MutationResult!
  completeStop(input: CompleteStopInput!): JobPayload!
  pushLocation(input: LocationInput!): MutationResult!
  remitCash(input: RemitInput!): RemittancePayload!
  withdrawEarnings(input: WithdrawInput!): WithdrawalPayload!

  # customer
  bookTable(input: BookTableInput!): ReservationPayload!
  cancelReservation(id: ID!, expectedVersion: Int!): ReservationPayload!
  subscribe(input: SubscribeInput!): SubscriptionPayload!
  skipDelivery(input: SkipInput!): SubscriptionPayload!
  requestQuote(input: RequestQuoteInput!): QuotePayload!
  submitReview(input: ReviewDraftInput!): ReviewPayload!
  topUpWallet(input: TopUpInput!): WalletPayload!
  updateSettings(input: SettingsInput!): SettingsPayload!
  registerPushDevice(input: DeviceInput!): MutationResult!

  # dine-in
  sendRound(input: SendRoundInput!): RoundPayload!
  requestService(input: ServiceRequestInput!): MutationResult!

  # admin / cms
  saveCmsDocument(input: CmsSaveInput!): CmsSavePayload!
  publishCmsDocument(id: ID!, expectedVersion: Int!): CmsSavePayload!
  revertCmsDocument(input: RevertInput!): CmsSavePayload!
  sendBroadcast(input: BroadcastInput!): BroadcastPayload!
  setFeatureFlag(input: FeatureFlagInput!): MutationResult!
}
```

## Payload types = the frontend's `Result<T>`

`services/http.ts` already defines
`Result<T> = { data: T; error: null } | { data: null; error: string }`, where
`error` is an **i18n key**. The payload types are that shape:

```graphql
interface MutationPayload {
  success: Boolean!
  error: UserError
}

type UserError {
  "i18n key, e.g. \"errors.invalidCredentials\", \"coupons.reason.minOrder\""
  key: String!
  "Field path for a form error, e.g. \"input.phone\"."
  path: String
  params: JSONObject
}

type OrderPayload implements MutationPayload {
  success: Boolean!
  error: UserError
  data: Order
}
```

So `services/orders.ts::placeOrder` keeps returning `Promise<Result<Order>>`
and its body becomes a two-line map from the payload. **Expected** failures
(bad credentials, coupon ineligible, table gone, version conflict) are payload
errors with HTTP 200. **Unexpected** failures are GraphQL errors — see §Errors.

## Pagination

Two mechanisms, chosen per list, because the frontend already uses both shapes.

**Offset** — `Paginated<T>` from `services/http.ts`, kept verbatim for every
existing list so no component changes:

```graphql
input PageInput { page: Int = 1, pageSize: Int = 12 }

interface Page { total: Int!, page: Int!, pageSize: Int!, hasMore: Boolean! }
type VendorPage implements Page {
  items: [Vendor!]!
  total: Int!  page: Int!  pageSize: Int!  hasMore: Boolean!
}
```

`pageSize` is capped at 100 server-side and `total` uses an estimated count
(`EXPLAIN`-derived) above 50k rows, because an exact `COUNT(*)` on a large
filtered set is the slowest thing on the page.

**Cursor** — added for the four feeds that are append-heavy and read as infinite
scroll, where offset drifts as rows arrive: `notificationFeed`, `orderEvents`,
`reviews`, `auditLog`. Relay-style, keyset over `(createdAt DESC, id DESC)`:

```graphql
input CursorInput { first: Int = 20, after: String }
type ReviewConnection {
  edges: [ReviewEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}
type PageInfo { hasNextPage: Boolean!, hasPreviousPage: Boolean!, startCursor: String, endCursor: String }
```

The cursor is base64 of `{ at, id }` — opaque, stable, and an index-only range
scan (`WHERE (created_at, id) < ($1, $2) ORDER BY … LIMIT n+1`), never `OFFSET`.
Both list styles coexist; nothing forces a migration of the offset lists.

## Filtering & sorting

Input objects mirror the query interfaces `services/*` already accept
(`VendorQuery`, `SearchQuery`, `ReviewQuery`, `OfferQuery`, `FeedQuery`,
`CmsListQuery`), so the call sites do not change:

```graphql
input VendorQueryInput {
  type: VendorType
  cuisineId: ID
  categorySlug: String
  dietary: [DietaryTag!]
  priceLevel: [Int!]
  minRating: Float
  maxDistanceKm: Float
  openNow: Boolean
  freeDelivery: Boolean
  hasOffers: Boolean
  amenities: [String!]
  q: String
  sort: VendorSort = RECOMMENDED
  near: GeoInput
}
```

Sorts are a **closed enum per resource**, never a free-form
`orderBy: [{ field, direction }]`. An open sort API is an invitation to sort by
an unindexed column; a closed one guarantees every option has an index behind
it. `VendorSort` = `RECOMMENDED | RATING | DISTANCE | DELIVERY_TIME | PRICE_LOW
| PRICE_HIGH | POPULAR`.

Filters compile to a Prisma `where` in one place per module
(`<module>.filter-builder.ts`), which is also where the allowlist lives — a
field absent from the builder is unreachable, whatever the client sends.

## Search

`search()` returns the existing `SearchResults` (vendors + food hits + facets).
Implementation is staged deliberately:

1. **Now** — Postgres: `pg_trgm` similarity on names, `tsvector` full text on
   dish name + description, `unaccent` so "biryani"/"biriyani" converge, ranked
   by `similarity × rating × proximity × openNow`, with facet counts from
   parallel `GROUP BY` queries against the same filtered CTE.
2. **Later, behind the `SearchPort`** — OpenSearch, when facet latency on a
   multi-million-row catalog stops being acceptable. Nothing above the port
   changes.

Suggestions come from `SearchTermStat` (refreshed from `SearchQueryLog` by a
scheduled job), so `popularSearchTerms()` stops being a hard-coded list.
Logging honours C28: nothing is written when `saveSearchHistory` is off.

## Subscriptions

`graphql-ws` over WebSocket, with a Redis PubSub adapter so any pod can publish
and every pod's subscribers receive it.

```graphql
type Subscription {
  orderUpdated(orderId: ID!): Order!             # customer tracking
  vendorOrderStream(vendorId: ID!): OrderEvent!  # kitchen board
  riderLocation(orderId: ID!): RiderPosition!    # live map
  jobOffered(riderId: ID!): DeliveryJob!         # the offer pool
  kitchenTicket(vendorId: ID!): KitchenTicket!   # KDS
  notificationReceived: AppNotification!         # the bell
  reservationUpdated(vendorId: ID!): Reservation!
  dineInRoundUpdated(sessionId: ID!): DineInRound!
  presenceChanged(room: String!): PresenceEvent!
}
```

Authorization runs on `connection_init` (the token is in the payload, never the
URL) **and again per subscribe** — a customer may only subscribe to their own
order, a vendor only to their own branch. Topics are namespaced
(`order:<id>`, `vendor:<id>:orders`) and the guard checks the actor against the
topic before the subscription is registered, not when the first event fires.
Full design in [D9](./D9-realtime-architecture.md).

## Authorization

Three layers, all declarative:

```ts
@Mutation(() => OrderPayload)
@Roles('restaurant-owner', 'vendor-manager')
@Permissions('orders:accept')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, VendorScopeGuard)
acceptOrder(@Args('input') input: AcceptOrderInput, @CurrentUser() actor: Actor) {}
```

1. **Authentication** — `JwtAuthGuard` on everything except `@Public()`.
2. **Coarse RBAC / fine PBAC** — role and permission guards, resolved once per
   request and cached in Redis under `perm:<userId>:<epoch>`.
3. **Ownership** — a guard is not enough for "this vendor's order". Every
   repository read that can be scoped takes the actor's scope, so an
   `acceptOrder` on someone else's order returns `NOT_FOUND`, not `FORBIDDEN`
   (no existence oracle). Row scoping lives in the repository, never only in the
   resolver.

Field-level: `@Sensitive()` strips `Order.contactPhone`,
`DeliveryStop.phone` and `NotificationDispatch.destinationRef` for actors
without the matching permission, via a field middleware — one place, not thirty
resolvers.

## Errors

| Situation | Mechanism | Frontend |
| --- | --- | --- |
| Expected domain refusal | `payload.error.key` (HTTP 200) | already handled by `Result<T>` |
| Not authenticated | GraphQL error, `code: UNAUTHENTICATED` | refresh, then retry once |
| Not permitted | `FORBIDDEN` | route to 403 |
| Missing / not visible | `NOT_FOUND` | 404 |
| Version conflict | `CONFLICT` + `currentVersion` | prompt to reload |
| Input invalid | `BAD_USER_INPUT` + per-field `issues[]` | attach to the form |
| Rate limited | `TOO_MANY_REQUESTS` + `retryAfter` | back off |
| Payment declined | `payload.error.key` under `payment.error.*` | show and offer retry |
| Anything unhandled | `INTERNAL_SERVER_ERROR`, generic message + `requestId` | generic toast |

One filter maps `DomainError → extensions`. Stack traces and Prisma error text
never leave the server in production; `requestId` is what support asks for.

## Validation

Zod schemas, colocated with each input type, run by a `ZodValidationPipe`
*before* the resolver — the same schemas the frontend forms already use, moved
into `shared/contracts` and imported by both, so a rule cannot drift. Validation
failure is `BAD_USER_INPUT` with an `issues[]` array shaped for
react-hook-form's `setError`.

Beyond shape: HTML sanitisation on every free-text field that is ever rendered
(review comments, replies, CMS text, contact messages), length caps matching the
schema's `VarChar`, and `Upload` restricted by MIME sniffing on content, not on
the declared type or extension.

## Upload

Direct-to-storage, never through the API:

1. `requestUpload(kind, mimeType, sizeBytes)` → validates against the kind's
   policy, mints a `FileAsset` row in `pending`, returns a **presigned POST**
   scoped to one key with a size limit and a 5-minute expiry.
2. The browser PUTs to S3-compatible storage.
3. `completeUpload(fileId)` → verifies the object exists and its real size and
   sniffed type, marks the asset `ready`, enqueues variant generation.

The Apollo `Upload` scalar remains only for the admin's CSV imports, which are
small and server-processed. Orphan `pending` assets are swept after 24 hours.

## Performance

- **DataLoader per request** for every `@ResolveField` that crosses an
  aggregate boundary (`Order.vendor`, `Review.author`, `FoodItem.options`).
  Registered in the GraphQL context factory, so batching is automatic.
- **Query complexity + depth limits** (`graphql-query-complexity`): depth 10,
  cost 1000 for an authenticated actor, 300 for anonymous. Every list field
  declares a cost multiplier from its `pageSize`.
- **Persisted queries** (APQ) in production; introspection and the playground
  are disabled outside development.
- **Response caching** in Redis for the public read path — cuisines, categories,
  CMS documents, offer boards, vendor cards — keyed by
  `(operation, variables, locale, countryCode, currency, actorRole)` and
  invalidated by tag on the owning mutation. Never cache anything scoped to a
  single user.
- `@nestjs/graphql` `fieldResolverEnhancers` limited to `guards` and
  `interceptors`; no per-field pipes.
- `relationJoins` in Prisma so the hot reads are one round trip.

## Frontend migration path

`services/*` is the seam and stays the seam. Each function's body swaps from
mock to a generated GraphQL document:

```ts
// before
export async function getVendorBySlug(slug: string): Promise<Vendor | null> {
  await mockDelay(null, 200);
  return vendorBySlug.get(slug) ?? null;
}

// after — same signature, same return type, no component touched
export async function getVendorBySlug(slug: string): Promise<Vendor | null> {
  const { data } = await gql.request(VendorBySlugDocument, { slug });
  return data.vendor ?? null;
}
```

Cutover is per-module and reversible: a `NEXT_PUBLIC_API_MODE=mock|graphql`
switch selects the implementation, so an unfinished module keeps serving mock
data while a finished one talks to the backend, and the whole app keeps working
after every phase — which is the Phase E rule.
