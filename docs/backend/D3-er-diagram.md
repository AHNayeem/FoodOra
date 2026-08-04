# D3 — ER Diagram

169 models in one diagram is a wall, not a document. So: one **context map**
showing how the bounded contexts relate, then one ER diagram per context with
every relationship in it. Cardinality notation is Mermaid's
(`||--o{` = one-to-many, `||--||` = one-to-one, `}o--o{` = many-to-many).

Join tables are shown where they carry meaning and collapsed to `}o--o{` where
they are pure link rows.

## Context map

```mermaid
flowchart TB
  subgraph PLATFORM
    REG[regions<br/>Country · Currency · Language · TaxRule]
    SET[settings<br/>Setting · FeatureFlag]
    AUD[audit · outbox · files]
  end

  subgraph IDENTITY
    USR[users<br/>User · Address · Favorite]
    RBAC[rbac<br/>Role · Permission]
    AUTH[auth<br/>Session · RefreshToken · Device · Otp]
  end

  subgraph MERCHANT
    CAT[catalog<br/>Vendor · Branch · Menu · Food]
    INV[inventory]
    DIN[dine-in · QR · POS]
    RSV[reservations]
  end

  subgraph COMMERCE
    CART[cart]
    ORD[orders]
    PRC[pricing + tax]
    PROMO[promotions<br/>Offer · Coupon]
    PAY[payments · ledger · payouts]
    WAL[wallet]
    REV[reviews]
  end

  subgraph FULFILMENT
    DEL[delivery<br/>Zone · Rider · Job · Stop]
  end

  subgraph VERTICALS
    SUB[subscriptions<br/>MealPlan]
    CTR[catering]
  end

  subgraph ENGAGEMENT
    CMS[cms · blog]
    NOT[notifications]
    AI[ai · search]
  end

  REG --> USR & CAT & DEL & PRC & SUB & CTR
  SET --> ORD & CAT & PAY
  USR --> CART & ORD & RSV & SUB & CTR & REV & WAL & NOT
  RBAC --> USR
  AUTH --> USR
  CAT --> CART & ORD & INV & DIN & RSV & PROMO & REV & SUB
  CART --> ORD
  PRC --> ORD & SUB & CTR & DIN
  PROMO --> CART & ORD
  ORD --> PAY & DEL & REV & NOT & WAL
  PAY --> WAL & SUB & CTR & RSV
  DEL --> ORD & REV
  ORD & DEL & RSV & SUB & CTR & PAY --> NOT
  AI --> CAT & ORD
  CMS --> CAT
  AUD --- ORD & PAY & CMS & USR
```

## 1. Platform & reference data

```mermaid
erDiagram
  Currency ||--o{ Country : "prices in"
  Currency ||--o{ ExchangeRate : "base"
  Currency ||--o{ ExchangeRate : "quote"
  Country ||--o{ CountryLanguage : "served in"
  Language ||--o{ CountryLanguage : ""
  Language ||--o{ Translation : "localises"
  Country ||--o{ TaxRule : "governs"
  Vendor  ||--o{ TaxRule : "overrides"
  Country ||--o{ User : "home of"
  Country ||--o{ VendorBranch : "located in"
  Country ||--o{ DeliveryZone : "operates in"
  User    ||--o{ FileAsset : "uploaded"
  User    ||--o{ AuditLog : "acted"

  Currency { string code PK  string symbol  int fractionDigits }
  Country { string code PK  string currencyCode FK  string timezone  string dialCode }
  Language { string code PK  enum direction }
  TaxRule { string id PK  string countryCode FK  string vendorId FK  enum kind  enum appliesTo  decimal rate  string label  datetime effectiveFrom }
  Setting { string id PK  enum scope  string scopeId  string key  json value }
  FeatureFlag { string id PK  string key UK  enum strategy  int rolloutPct  array targets }
  Translation { string id PK  string entity  string entityId  string field  string languageCode FK }
  FileAsset { string id PK  string bucket  string key  string ownerEntity  string ownerId }
  AuditLog { string id PK  string action  string entity  string entityId  string actorId FK  json changes }
  OutboxEvent { string id PK  string eventName  string aggregateId  enum status  json payload }
  IdempotencyKey { string key PK  string requestHash  json response  datetime expiresAt }
```

## 2. Identity, RBAC and auth

```mermaid
erDiagram
  User ||--|| Credential : "has"
  User ||--|| UserSettings : "has"
  User ||--o{ NotificationPreference : "per topic"
  User ||--o{ Address : "address book"
  User ||--o{ Favorite : "saved"
  User ||--o{ SocialIdentity : "linked"
  User ||--o{ Session : "signed in"
  Session ||--o{ RefreshToken : "rotation chain"
  RefreshToken ||--o| RefreshToken : "parent of"
  User ||--o{ Device : "registered"
  Device ||--o{ Session : "used by"
  User ||--o{ OtpChallenge : "requested"
  User ||--o{ PasswordReset : "requested"
  User ||--o{ UserRoleAssignment : "holds"
  Role ||--o{ UserRoleAssignment : "granted to"
  Vendor ||--o{ UserRoleAssignment : "scoped to"
  Role }o--o{ Permission : "RolePermission"
  User ||--o{ UserPermission : "direct grant/deny"
  Permission ||--o{ UserPermission : ""

  User { string id PK  string name  citext email UK  string phone UK  enum primaryRole  enum status  string countryCode FK  string currency  string locale  bool isVerified  int version }
  Credential { string userId PK  string passwordHash  int tokenEpoch  int failedCount  datetime lockedUntil }
  Role { string id PK  string slug UK  enum builtin  bool isSystem  int rank }
  Permission { string id PK  string slug UK  string resource  string action }
  UserRoleAssignment { string id PK  string userId FK  string roleId FK  string vendorId FK  datetime expiresAt }
  UserPermission { string id PK  string userId FK  string permissionId FK  bool effect }
  Session { string id PK  string userId FK  string deviceId FK  bool rememberMe  datetime expiresAt  datetime revokedAt }
  RefreshToken { string id PK  string sessionId FK  char tokenHash UK  string parentId FK  datetime usedAt }
  Device { string id PK  string userId FK  string installId  enum platform  string pushToken }
  OtpChallenge { string id PK  enum purpose  enum channel  string destination  char codeHash  int attempts  datetime expiresAt }
  Address { string id PK  string userId FK  string line1  string area  string city  string countryCode  bool isDefault }
  UserSettings { string userId PK  bool personalizedRecommendations  bool loginAlerts  bool twoFactor }
  NotificationPreference { string userId PK  enum topic PK  bool email  bool push  bool sms }
  Favorite { string userId PK  enum kind PK  string targetId PK }
```

## 3. Catalog — brand, branch, menu, dish

```mermaid
erDiagram
  User ||--o{ Vendor : "owns"
  Vendor ||--o{ VendorBranch : "locations"
  Vendor ||--o{ VendorStaff : "employs"
  Vendor }o--o{ Cuisine : "VendorCuisine"
  Vendor ||--o{ VendorDietary : "tags"
  VendorBranch ||--o{ BranchHour : "weekly grid"
  VendorBranch ||--o{ BranchClosure : "exceptions"
  VendorBranch }o--o{ Amenity : "BranchAmenity"
  DeliveryZone ||--o{ VendorBranch : "dispatches"
  Vendor ||--o{ Menu : "publishes"
  Menu ||--o{ MenuSection : "sections"
  Vendor ||--o{ MenuSection : "denormalised"
  MenuSection ||--o{ FoodItem : "dishes"
  Vendor ||--o{ FoodItem : "denormalised"
  FoodItem ||--o{ FoodOptionGroup : "customisation"
  FoodOptionGroup ||--o{ FoodOption : "choices"
  FoodItem ||--|| FoodNutrition : "macros"
  FoodItem ||--o{ FoodDietary : "tags"
  FoodItem ||--o{ FoodAllergen : "warnings"
  FoodItem }o--o{ Category : "FoodCategory"
  Category ||--o{ CategoryKeyword : "search terms"
  Category ||--o{ Category : "parent of"
  FoodItem ||--o| InventoryItem : "stock"
  Vendor ||--o{ InventoryItem : "tracks"
  InventoryItem ||--o{ StockMovement : "ledger"

  Cuisine { string id PK  string slug UK  string name  string emoji }
  Category { string id PK  string slug UK  string name  int sort  string parentId FK }
  Vendor { string id PK  string slug UK  enum type  string ownerId FK  string name  int priceLevel  decimal rating  int reviewCount  string currency  enum status  decimal commissionRate  int version }
  VendorBranch { string id PK  string vendorId FK  bool isPrimary  decimal lat  decimal lng  string city  string countryCode FK  string timezone  int etaMinMinutes  int etaMaxMinutes  decimal deliveryFee  decimal minOrder  decimal freeDeliveryOver  bool acceptingOrders  string zoneId FK }
  BranchHour { string id PK  string branchId FK  enum weekday  string openTime  string closeTime  bool overnight }
  Menu { string id PK  string vendorId FK  enum kind  bool isDefault }
  MenuSection { string id PK  string menuId FK  string vendorId FK  string name  int sort }
  FoodItem { string id PK  string slug UK  string vendorId FK  string sectionId FK  string name  decimal price  decimal compareAtPrice  int spicyLevel  int calories  decimal rating  bool isPopular  bool isAvailable  int version }
  FoodOptionGroup { string id PK  string foodId FK  string name  bool required  int min  int max }
  FoodOption { string id PK  string groupId FK  string name  decimal priceDelta }
  FoodNutrition { string foodId PK  int calories  decimal protein  decimal carbs  decimal fat  string source }
  InventoryItem { string id PK  string vendorId FK  string foodId FK UK  decimal onHand  decimal reserved  decimal lowStockAt  bool trackStock }
  StockMovement { string id PK  string itemId FK  enum kind  decimal quantity  decimal balance  string refId }
  Amenity { string id PK  string slug UK  string name  string group }
  VendorStaff { string id PK  string vendorId FK  string userId FK  string jobTitle  string pinHash }
```

## 4. Cart and orders

```mermaid
erDiagram
  User ||--o{ Cart : "holds"
  Vendor ||--o{ Cart : "single-vendor"
  VendorBranch ||--o{ Cart : ""
  Address ||--o{ Cart : "deliver to"
  Coupon ||--o{ Cart : "applied"
  Cart ||--o{ CartItem : "lines"
  CartItem ||--o{ CartItemOption : "selections"
  FoodOption ||--o{ CartItemOption : ""
  FoodItem ||--o{ CartItem : ""

  User ||--o{ Order : "placed"
  Vendor ||--o{ Order : "fulfils"
  VendorBranch ||--o{ Order : ""
  Rider ||--o{ Order : "delivers"
  Coupon ||--o{ Order : "discounted"
  Order ||--o{ OrderItem : "lines"
  OrderItem ||--o{ OrderItemOption : "selections"
  FoodItem ||--o{ OrderItem : ""
  Order ||--o{ OrderEvent : "lifecycle log"
  Order ||--o{ OrderRiderDecline : "declined by"
  Rider ||--o{ OrderRiderDecline : ""
  Order ||--|| Invoice : "issued"
  Order ||--o{ RefundRequest : "claimed"
  Order ||--o{ PaymentIntent : "paid by"
  Order ||--o{ CouponRedemption : "spent on"
  Order ||--o{ Review : "reviewed by"
  Order ||--o{ DeliveryJobOrder : "carried on"

  Cart { string id PK  string userId FK  string guestKey  string vendorId FK  enum fulfillment  string addressId FK  decimal tip  string couponId FK  int version }
  CartItem { string id PK  string cartId FK  string foodId FK  decimal basePrice  decimal unitPrice  int quantity }
  CartItemOption { string cartItemId PK  string optionId PK  string groupId  decimal priceDelta }
  Order { string id PK  string orderNumber UK  string userId FK  string vendorId FK  string branchId FK  json vendorSnapshot  json addressSnapshot  enum fulfillment  datetime scheduledFor  enum paymentMethod  enum paymentStatus  string currency  decimal subtotal  decimal deliveryFee  decimal discount  decimal tax  decimal taxRate  decimal tip  decimal total  decimal commission  enum status  datetime placedAt  datetime estimatedDeliveryAt  int prepMinutes  datetime promisedReadyAt  int delayMinutes  enum cancelReason  json riderSnapshot  string riderId FK  enum assignment  char otpHash  int otpAttempts  enum refundStatus  int rating  int version }
  OrderItem { string id PK  string orderId FK  string foodId FK  string lineKey  decimal unitPrice  int quantity  decimal lineTotal }
  OrderEvent { string id PK  string orderId FK  enum status  datetime at  enum actor  string actorId  string note  json meta }
  OrderRiderDecline { string orderId PK  string riderId PK  datetime declinedAt }
  Invoice { string id PK  string orderId FK UK  string invoiceNumber UK  string countryCode  decimal tax  decimal total  json sellerDetails }
  RefundRequest { string id PK  string orderId FK  enum status  decimal amount  enum reason  string decidedById }
  NumberSequence { string scope PK  bigint current }
```

## 5. Payments, ledger and settlement

```mermaid
erDiagram
  PaymentProvider ||--o{ PaymentIntent : "processes"
  PaymentProvider ||--o{ PaymentTransaction : ""
  PaymentProvider ||--o{ Refund : ""
  PaymentProvider ||--o{ PaymentWebhookEvent : "calls back"
  PaymentProvider ||--o{ SavedPaymentMethod : "tokenises"
  PaymentProvider ||--o{ Payout : "disburses"
  Order ||--o{ PaymentIntent : ""
  SubscriptionCycle ||--o| PaymentIntent : "charges"
  PaymentIntent ||--o{ PaymentTransaction : "attempts"
  PaymentIntent ||--o{ Refund : "reverses"
  Order ||--o{ Refund : ""
  RefundRequest ||--o{ Refund : "authorises"
  User ||--o{ SavedPaymentMethod : "saved"

  User ||--|| Wallet : "has"
  Wallet ||--o{ WalletTransaction : "ledger"
  Order ||--o{ WalletTransaction : "paid/refunded"

  LedgerAccount ||--o{ LedgerEntry : "double entry"
  Order ||--o{ LedgerEntry : "generated"

  Vendor ||--o{ PayoutAccount : "banks with"
  Rider  ||--o{ PayoutAccount : ""
  PayoutAccount ||--o{ Payout : "paid into"
  Vendor ||--o{ Payout : "settled"
  Rider  ||--o{ Payout : ""
  MembershipPlan ||--o{ VendorMembership : "subscribed"
  Vendor ||--o{ VendorMembership : ""

  PaymentProvider { string id PK  enum kind UK  array countryCodes  array capabilities  json credentialRefs  int priority  bool isEnabled  decimal feeRate }
  PaymentIntent { string id PK  string orderId FK  string providerId FK  enum method  enum status  decimal amount  decimal capturedAmount  decimal refundedAmount  string providerRef  string clientRef UK  int attempt  int version }
  PaymentTransaction { string id PK  string intentId FK  enum kind  bool success  json rawPayload  int latencyMs }
  Refund { string id PK  string intentId FK  decimal amount  bool isPartial  enum reason  enum status  bool toWallet }
  PaymentWebhookEvent { string id PK  string providerId FK  string eventId UK  enum status  bool signatureValid  json payload }
  Wallet { string id PK  string userId FK UK  string currency  decimal balance  decimal pending  int version }
  WalletTransaction { string id PK  string walletId FK  enum type  decimal amount  decimal balanceAfter  string orderNumber }
  LedgerAccount { string id PK  enum kind  string ownerId  string currency  decimal balance }
  LedgerEntry { string id PK  string accountId FK  string transactionRef  string eventName  decimal amount  string orderId FK }
  Payout { string id PK  string reference UK  string vendorId FK  string riderId FK  enum status  decimal grossAmount  decimal commission  decimal netAmount  datetime periodEnd }
  CommissionRule { string id PK  string vendorId  enum vendorType  string countryCode  decimal rate  int priority }
  MembershipPlan { string id PK  string slug UK  enum interval  decimal price  array features }
  VendorMembership { string id PK  string vendorId FK  string planId FK  enum status  datetime currentPeriodEnd }
```

## 6. Promotions

```mermaid
erDiagram
  Offer }o--o{ Vendor : "OfferVendor"
  Offer }o--o{ Category : "OfferCategory"
  Offer ||--o{ Coupon : "mints"
  Coupon }o--o{ Vendor : "CouponVendor"
  Coupon }o--o{ Category : "CouponCategory"
  Vendor ||--o{ Coupon : "issues"
  User ||--o{ CouponClaim : "holds"
  Coupon ||--o{ CouponClaim : "held by"
  CouponClaim ||--o{ CouponRedemption : "spent"
  Coupon ||--o{ CouponRedemption : ""
  Order ||--o{ CouponRedemption : "on"

  Offer { string id PK  string slug UK  string title  enum kind  decimal value  decimal maxDiscount  decimal minOrder  enum scope  string code  enum placement  datetime startsAt  datetime endsAt  int claimed  int claimLimit  bool firstOrderOnly }
  Coupon { string id PK  string code UK  string title  enum kind  decimal value  decimal maxDiscount  decimal minOrder  enum scope  datetime startsAt  datetime endsAt  int usageLimit  int totalLimit  int totalRedeemed  bool firstOrderOnly  enum source  bool claimable  string offerId FK  string issuerVendorId FK }
  CouponClaim { string userId PK  string couponId PK  datetime claimedAt  enum via }
  CouponRedemption { string id PK  string couponId FK  string userId FK  string orderId FK  decimal discount  decimal deliveryWaived  decimal cashback }
```

## 7. Reviews

```mermaid
erDiagram
  Review ||--o{ ReviewAspectScore : "scored"
  Review ||--o{ ReviewTagLink : "tagged"
  Review ||--o{ ReviewDish : "about"
  FoodItem ||--o{ ReviewDish : ""
  Review ||--o{ ReviewMedia : "photos/video"
  FileAsset ||--o{ ReviewMedia : ""
  Review ||--|| ReviewReply : "answered"
  Review ||--o{ ReviewVote : "helpful"
  User ||--o{ ReviewVote : ""
  Review ||--o{ ReviewReport : "flagged"
  User ||--o{ ReviewReport : ""
  User ||--o{ Review : "wrote"
  Vendor ||--o{ Review : "about"
  Rider ||--o{ Review : "about"
  Order ||--o{ Review : "proof of purchase"
  Vendor ||--o{ RatingAggregate : "counters"

  Review { string id PK  enum subject  string subjectId  string vendorId FK  string riderId FK  string orderId FK  string authorId FK  string authorName  int rating  string comment  int helpfulCount  bool verified  enum status  int version }
  ReviewAspectScore { string reviewId PK  enum aspect PK  int score }
  ReviewTagLink { string reviewId PK  enum tag PK }
  ReviewMedia { string id PK  string reviewId FK  enum kind  string url  string thumbnail }
  ReviewReply { string reviewId PK  string body  string authorName  datetime repliedAt }
  ReviewVote { string reviewId PK  string userId PK }
  RatingAggregate { string id PK  enum subject  string subjectId  string month  int count  int starSum  int star1  int star5  int withMedia  int verified }
```

## 8. Delivery

```mermaid
erDiagram
  Country ||--o{ DeliveryZone : ""
  DeliveryZone ||--o{ ZoneArea : "covers"
  DeliveryZone ||--o{ Rider : "home pool"
  DeliveryZone ||--o{ DeliveryJob : "priced by"
  User ||--o| Rider : "account"
  Rider ||--o{ RiderDocument : "verified by"
  Rider ||--o{ RiderShift : "worked"
  Rider ||--o{ DeliveryJob : "assigned"
  Rider ||--o{ JobOffer : "offered"
  DeliveryJob ||--o{ JobOffer : "dispatched"
  DeliveryJob ||--o{ DeliveryJobOrder : "carries"
  Order ||--o{ DeliveryJobOrder : ""
  DeliveryJob ||--o{ DeliveryStop : "route"
  DeliveryJob ||--o{ RiderLocationPing : "breadcrumbs"
  Rider ||--o{ RiderLocationPing : ""
  Rider ||--o{ RiderLedgerEntry : "money"
  DeliveryJob ||--o{ RiderLedgerEntry : "earned on"
  Rider ||--o{ RiderRemittance : "hands back"
  Rider ||--o{ RiderWithdrawal : "cashes out"

  DeliveryZone { string id PK  string name  string city  string countryCode FK  string currency  decimal lat  decimal lng  json boundary  decimal baseFare  decimal perKm  decimal peakMultiplier  array peakHours  decimal batchBonus  decimal cashLimit  decimal minWithdrawal }
  Rider { string id PK  string userId FK UK  string name  string phone  enum vehicle  string plate  string zoneId FK  enum status  decimal rating  int trips  decimal acceptanceRate  decimal onTimeRate  bool isOnShift  decimal lastLat  decimal lastLng  int version }
  RiderDocument { string id PK  string riderId FK  enum kind  enum status  string fileId  datetime expiresAt }
  DeliveryJob { string id PK  string jobNumber UK  string riderId FK  string zoneId FK  enum status  decimal distanceKm  int estimatedMinutes  decimal baseFare  decimal distanceFee  decimal peakBonus  decimal batchBonus  decimal tip  decimal payoutTotal  decimal cashToCollect  datetime offeredAt  datetime expiresAt  datetime acceptedAt  int version }
  DeliveryJobOrder { string jobId PK  string orderId PK  string orderNumber  string vendorName  string customerName  int itemCount  decimal orderTotal  enum paymentMethod  decimal cashDue }
  DeliveryStop { string id PK  string jobId FK  enum kind  string orderId  string name  string address  decimal lat  decimal lng  int sequence  decimal legKm  int legMinutes  char otpHash  decimal cashDue  datetime completedAt }
  JobOffer { string id PK  string jobId FK  string riderId FK  enum outcome  decimal score  datetime expiresAt }
  RiderLedgerEntry { string id PK  string riderId FK  enum type  decimal amount  string reference  string jobId FK  bool isSettled  bool affectsCash }
  RiderRemittance { string id PK  string riderId FK  decimal amount  enum method  string reference  datetime occurredAt }
  RiderWithdrawal { string id PK  string riderId FK  decimal amount  enum status  string reference }
```

## 9. Reservations and dine-in

```mermaid
erDiagram
  Vendor ||--|| BookingPolicy : "rules"
  BookingPolicy ||--o{ BookingPolicyZone : "sells online"
  Vendor ||--o{ RestaurantTable : "floor plan"
  Vendor ||--o{ Reservation : "books"
  User ||--o{ Reservation : "made"
  Reservation }o--o{ RestaurantTable : "ReservationTable"

  Vendor ||--|| QrMenuConfig : "QR settings"
  RestaurantTable ||--o{ DineInSession : "sitting"
  DineInSession ||--o{ DineInRound : "rounds"
  DineInRound ||--o{ DineInRoundItem : "lines"
  FoodItem ||--o{ DineInRoundItem : ""
  DineInSession ||--o{ ServiceRequest : "calls"

  Vendor ||--o{ PosShift : "till sessions"
  Vendor ||--o{ PosHeldTicket : "parked"
  RestaurantTable ||--o{ PosHeldTicket : ""
  PosHeldTicket ||--o{ PosHeldTicketLine : "lines"
  Vendor ||--o{ PosSale : "sold"
  PosShift ||--o{ PosSale : "during"
  User ||--o{ PosSale : "cashier"
  PosSale ||--o{ PosSaleItem : "lines"
  FoodItem ||--o{ PosSaleItem : ""

  BookingPolicy { string id PK  string vendorId FK UK  int turnMinutes  int largePartyTurnMinutes  int largePartyFrom  int slotMinutes  int minPartySize  int maxPartySize  int lastSeatingBeforeClose  int leadTimeMinutes  int advanceDays  decimal depositPerGuest  int depositFrom  int cancelCutoffHours  bool autoConfirm }
  RestaurantTable { string id PK  string vendorId FK  string label  int seats  enum zone  bool isActive }
  Reservation { string id PK  string reference UK  string userId FK  string vendorId FK  json venueSnapshot  date date  string time  datetime startsAt  datetime endsAt  int durationMinutes  int partySize  array tableLabels  enum zone  enum occasion  string guestName  string guestPhone  enum status  decimal depositAmount  int version }
  QrMenuConfig { string id PK  string vendorId FK UK  string welcomeMessage  bool ordering  bool waiterCall  bool billRequest  decimal serviceChargeRate  bool askGuestName }
  DineInSession { string id PK  string vendorId  string tableId FK  string guestKey  enum status  decimal serviceChargeRate  decimal taxRate  datetime openedAt  string posSaleId UK }
  DineInRound { string id PK  string sessionId FK  int roundNumber  string note  datetime sentAt  datetime servedAt }
  ServiceRequest { string id PK  string sessionId FK  enum kind  datetime requestedAt  datetime resolvedAt }
  PosShift { string id PK  string vendorId FK  string cashierName  decimal openingFloat  decimal closingCount  decimal expectedCash  datetime closedAt }
  PosSale { string id PK  string saleNumber UK  string vendorId FK  string shiftId FK  enum orderType  string tableLabel  decimal subtotal  decimal discount  decimal tax  decimal total  enum method  decimal tendered  decimal change  string cashierName  datetime soldAt }
```

## 10. Subscriptions (meal plans) and catering

```mermaid
erDiagram
  Vendor ||--o{ MealPlan : "cooks"
  MealPlan ||--o{ PlanTier : "commitments"
  MealPlan ||--o{ PlanMeal : "weekly menu"
  PlanMeal ||--o{ PlanMealDietary : ""
  MealPlan ||--o{ MealPlanDay : "delivers on"
  MealPlan ||--o{ MealPlanSlot : "covers"
  MealPlan ||--o{ MealPlanDietary : ""
  User ||--o{ Subscription : "commits"
  MealPlan ||--o{ Subscription : ""
  PlanTier ||--o{ Subscription : ""
  Address ||--o{ Subscription : "delivers to"
  Subscription ||--o{ SubscriptionDay : "chosen days"
  Subscription ||--o{ SubscriptionSlot : "chosen slots"
  Subscription ||--o{ SubscriptionSkip : "skipped"
  Subscription ||--o{ SubscriptionCycle : "billed"

  CateringService ||--o{ CateringPackage : "offers"
  CateringService }o--o{ Cuisine : "ServiceCuisine"
  CateringService ||--o{ CateringServiceEvent : "caters"
  CateringService ||--o{ CateringServiceStyle : "serves"
  CateringService }o--o{ CateringAddOn : "ServiceAddOn"
  User ||--o{ CateringQuote : "requests"
  CateringService ||--o{ CateringQuote : "quotes"
  CateringPackage ||--o{ CateringQuote : "based on"
  CateringQuote ||--o{ CateringQuoteAddOn : "extras"
  CateringAddOn ||--o{ CateringQuoteAddOn : ""

  MealPlan { string id PK  string vendorId FK  string slug UK  string name  enum goal  int caloriesPerDay  decimal proteinPerDay  array highlights  decimal rating  string currency  decimal deliveryFeePerDay  int leadTimeDays  int skipCutoffHours  bool isFeatured }
  PlanTier { string id PK  string planId FK  string name  enum cycle  int mealsPerDay  decimal pricePerMeal  decimal discountRate  bool isPopular }
  PlanMeal { string id PK  string planId FK  enum day  enum slot  string name  int calories  decimal protein  int weekIndex }
  Subscription { string id PK  string reference UK  string userId FK  string planId FK  string tierId FK  json planSnapshot  enum cycle  int mealsPerDay  date startDate  string deliveryWindow  json addressSnapshot  decimal pricePerMeal  int mealCount  decimal subtotal  decimal discount  decimal total  enum status  date pausedUntil  date renewsOn  int version }
  SubscriptionCycle { string id PK  string subscriptionId FK  int cycleNumber  date periodStart  date periodEnd  enum status  decimal amount  int mealCount  int retryCount }
  CateringService { string id PK  string slug UK  string name  array gallery  decimal rating  decimal lat  decimal lng  string city  int minGuests  int maxGuests  decimal pricePerGuestFrom  int leadTimeDays  decimal serviceFeeRate }
  CateringPackage { string id PK  string serviceId FK  string slug  enum eventType  enum serviceStyle  decimal pricePerGuest  int minGuests  array courses  array includes }
  CateringAddOn { string id PK  string slug UK  string name  decimal price  enum unit }
  CateringQuote { string id PK  string quoteNumber UK  string serviceId FK  string userId FK  json serviceSnapshot  string packageId FK  enum eventType  date eventDate  int guests  string venueCity  string contactName  decimal pricePerGuest  decimal packageSubtotal  decimal addOnsTotal  decimal serviceFee  decimal total  enum status  decimal quotedTotal }
```

## 11. CMS, content, notifications, AI and search

```mermaid
erDiagram
  CmsCollection ||--o{ CmsDocument : "declares shape of"
  CmsDocument ||--o{ CmsRevision : "history"
  CmsDocument ||--o{ CmsAuditEntry : "trail"
  BlogPost ||--o{ PostTag : "tagged"

  NotificationTemplate ||--o{ Notification : "renders"
  User ||--o{ Notification : "inbox"
  Order ||--o{ Notification : "about"
  Notification ||--o{ NotificationChannelRecord : "went out on"
  Notification ||--o{ NotificationDispatch : "attempts"
  NotificationSegment ||--o{ NotificationCampaign : "targets"
  NotificationCampaign ||--o{ Notification : "fans out to"

  User ||--|| FoodProfile : "dietary context"
  User ||--o{ AiConversation : "threads"
  AiConversation ||--o{ AiMessage : "turns"
  User ||--o{ SearchQueryLog : "searched"

  CmsCollection { enum id PK  string label  string icon  string surface  json fields  bool creatable  bool orderable  string titleField }
  CmsDocument { string id PK  enum collection FK  string key  json values  json draft  int sort  datetime publishAt  datetime unpublishAt  datetime publishedAt  datetime archivedAt  bool locked  json fields  json fallbacks  int version }
  CmsRevision { string id PK  string documentId FK  json values  enum reason  datetime at }
  CmsAuditEntry { string id PK  string documentId FK  enum collection  string title  enum action  datetime at }
  CmsContactMessage { string id PK  string name  string email  enum topic  string message  enum status }
  BlogPost { string id PK  string slug UK  string title  string excerpt  string category  enum status  string author  int readMinutes  datetime publishedAt  json body  json localized }
  Testimonial { string id PK  string name  string role  string quote  int rating  bool isPublished }
  JobOpening { string id PK  string slug UK  string title  string team  string location  enum status  array requirements }
  NotificationTemplate { string id PK  string key  enum audience  enum category  array channels  bool isRequired  enum topic  json providerRefs }
  Notification { string id PK  string userId FK  enum audience  enum category  string key  json params  json text  enum tone  enum subjectKind  string subjectId  string subjectLabel  enum orderStatus  string href  datetime at  datetime readAt }
  NotificationDispatch { string id PK  string notificationId FK  enum channel  string to  enum status  string reason  string providerRef  int attempts }
  NotificationCampaign { string id PK  enum segmentId FK  enum kind  enum status  string title  string body  array channels  int audienceSize  json results }
  FoodProfile { string userId PK  array allergens  array dietary  int calorieTarget  decimal budgetPerOrder  int spiceTolerance }
  AiConversation { string id PK  string userId FK  enum surface  json context  datetime lastMessageAt }
  AiMessage { string id PK  string conversationId FK  enum role  string text  json blocks  enum intent  array foodIds }
  SearchQueryLog { string id PK  string userId FK  string term  json filters  int resultCount  string clickedId  int clickedRank }
```

## Relationship summary

| From | To | Kind | Note |
| --- | --- | --- | --- |
| User → Vendor | owner | 1:N optional | `ownerId` powers "my restaurant" |
| Vendor → VendorBranch | locations | 1:N, exactly one primary | the brand/location split (D2) |
| VendorBranch → DeliveryZone | dispatch | N:1 optional | fare rules and rider pool |
| Vendor → Menu → MenuSection → FoodItem | catalog | 1:N chain | `vendorId` denormalised onto the last two |
| FoodItem → FoodOptionGroup → FoodOption | customisation | 1:N chain | |
| Cart → Order | checkout | conversion, not FK | the cart is consumed, snapshots are frozen |
| Order → OrderEvent | lifecycle | 1:N append-only | the only honest timeline |
| Order → PaymentIntent | collection | 1:N | a retry is a new intent |
| PaymentIntent → Refund | reversal | 1:N | partial refunds are rows |
| Order ↔ DeliveryJob | fulfilment | M:N via `DeliveryJobOrder` | batching is why it is M:N |
| DeliveryJob → DeliveryStop | route | 1:N ordered by `sequence` | |
| Coupon → CouponClaim → CouponRedemption | promotion | 1:N chain | rule / holding / spending, kept apart |
| Offer → Coupon | mint | 1:N optional | a campaign coupon inherits its terms |
| Order → Review | proof of purchase | 1:N, unique per subject | one order, one vendor review, one rider review |
| Review → ReviewReply | answer | 1:1 | unique on `reviewId` |
| Reservation ↔ RestaurantTable | seating | M:N | a big party spans two tables |
| MealPlan → PlanTier / PlanMeal | product | 1:N | tiers priced, meals rotate |
| Subscription → SubscriptionCycle | billing | 1:N | each renewal is auditable |
| CateringService → CateringPackage / CateringQuote | vertical | 1:N | |
| CmsCollection → CmsDocument → CmsRevision | content | 1:N chain | schema / values / history |
| Notification → NotificationDispatch | delivery | 1:N | one row per channel attempt |
| LedgerAccount → LedgerEntry | money | 1:N double-entry | Σ per `transactionRef` = 0 |
