/**
 * reference.js — the reference tables, as data.
 *
 * Every row below is a copy of something the frontend already publishes, with
 * the file it came from named beside it. That is the rule this file is written
 * to: **the seeder invents nothing.** A rate, a zone fare or a permission slug
 * that exists here and nowhere else is a second source of truth, and the first
 * time somebody edits the frontend's copy the two disagree silently.
 *
 * Sources, in the frontend:
 *
 *   config/regions.ts        currencies, countries, tax rates
 *   config/i18n/config.ts    the three locales and their direction
 *   lib/rbac.ts              PLATFORM_PERMISSIONS and ROLE_PERMISSIONS
 *   types/user.ts            UserRole — the fourteen built-in role slugs
 *   lib/mock/delivery-zones  the three Dhaka zones and their fares
 *   lib/mock/drop-points     area centroids
 *   types/order.ts           PaymentMethod — cash, card, wallet
 *
 * Values are in the **frontend's vocabulary** (kebab-case), because that is what
 * `@map` stores. `shared/utils/enums.js` translates them to Prisma identifiers on
 * the way in; nothing here has to know a Prisma enum member name.
 */

// ---------------------------------------------------------------------------
// Currencies — config/regions.ts::currencies
// ---------------------------------------------------------------------------

export const currencies = [
  { code: "BDT", symbol: "৳", formatLocale: "bn-BD", fractionDigits: 0, sort: 0 },
  { code: "USD", symbol: "$", formatLocale: "en-US", fractionDigits: 2, sort: 1 },
  { code: "EUR", symbol: "€", formatLocale: "de-DE", fractionDigits: 2, sort: 2 },
  { code: "GBP", symbol: "£", formatLocale: "en-GB", fractionDigits: 2, sort: 3 },
  { code: "AED", symbol: "د.إ", formatLocale: "ar-AE", fractionDigits: 2, sort: 4 },
];

// ---------------------------------------------------------------------------
// Languages — config/i18n/config.ts::localeMeta
// ---------------------------------------------------------------------------

export const languages = [
  { code: "en", name: "English", nativeName: "English", direction: "ltr", sort: 0 },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", direction: "ltr", sort: 1 },
  { code: "ar", name: "Arabic", nativeName: "العربية", direction: "rtl", sort: 2 },
];

// ---------------------------------------------------------------------------
// Countries — config/regions.ts::countries. `BD` is `defaultCountry`, hence sort 0.
// ---------------------------------------------------------------------------

export const countries = [
  { code: "BD", name: "Bangladesh", currencyCode: "BDT", timezone: "Asia/Dhaka", dialCode: "+880", defaultLocale: "en", sort: 0 },
  { code: "US", name: "United States", currencyCode: "USD", timezone: "America/New_York", dialCode: "+1", defaultLocale: "en", sort: 1 },
  { code: "GB", name: "United Kingdom", currencyCode: "GBP", timezone: "Europe/London", dialCode: "+44", defaultLocale: "en", sort: 2 },
  { code: "AE", name: "United Arab Emirates", currencyCode: "AED", timezone: "Asia/Dubai", dialCode: "+971", defaultLocale: "en", sort: 3 },
  { code: "DE", name: "Germany", currencyCode: "EUR", timezone: "Europe/Berlin", dialCode: "+49", defaultLocale: "en", sort: 4 },
];

/**
 * Which languages each country offers.
 *
 * All three locales everywhere, because the app ships all three everywhere: the
 * switcher in `config/i18n` is global and a visitor in Berlin can read the site
 * in Bengali today.
 *
 * `en` is the default in every country, which is `config/i18n/config.ts::
 * defaultLocale` and nothing more. Making Bengali the default in Bangladesh and
 * Arabic in the Emirates would be a better product and it is **not what the
 * frontend does**; the seeder is not the place to decide it. The rows are here
 * so that the module which does decide has something to change.
 */
export const countryLanguages = [
  { countryCode: "BD", languageCode: "en", isDefault: true, sort: 0 },
  { countryCode: "BD", languageCode: "bn", isDefault: false, sort: 1 },
  { countryCode: "BD", languageCode: "ar", isDefault: false, sort: 2 },
  { countryCode: "US", languageCode: "en", isDefault: true, sort: 0 },
  { countryCode: "US", languageCode: "bn", isDefault: false, sort: 1 },
  { countryCode: "US", languageCode: "ar", isDefault: false, sort: 2 },
  { countryCode: "GB", languageCode: "en", isDefault: true, sort: 0 },
  { countryCode: "GB", languageCode: "bn", isDefault: false, sort: 1 },
  { countryCode: "GB", languageCode: "ar", isDefault: false, sort: 2 },
  { countryCode: "AE", languageCode: "en", isDefault: true, sort: 0 },
  { countryCode: "AE", languageCode: "ar", isDefault: false, sort: 1 },
  { countryCode: "AE", languageCode: "bn", isDefault: false, sort: 2 },
  { countryCode: "DE", languageCode: "en", isDefault: true, sort: 0 },
  { countryCode: "DE", languageCode: "ar", isDefault: false, sort: 1 },
  { countryCode: "DE", languageCode: "bn", isDefault: false, sort: 2 },
];

// ---------------------------------------------------------------------------
// Tax — config/regions.ts, `taxRate` / `taxLabel` per country.
//
// One rule per country, on the order subtotal, exclusive, effective from the
// epoch. That is exactly what `lib/platform-settings.resolveTax` computes today:
// a flat country rate with no regional narrowing and no vendor override. The
// schema supports both; seeding either would be inventing policy.
// ---------------------------------------------------------------------------

export const taxRules = [
  { countryCode: "BD", kind: "vat", label: "VAT", rate: "0.0500" },
  { countryCode: "US", kind: "sales-tax", label: "Sales Tax", rate: "0.0875" },
  { countryCode: "GB", kind: "vat", label: "VAT", rate: "0.2000" },
  { countryCode: "AE", kind: "vat", label: "VAT", rate: "0.0500" },
  { countryCode: "DE", kind: "vat", label: "VAT", rate: "0.1900" },
];

// ---------------------------------------------------------------------------
// Permissions — lib/rbac.ts::PLATFORM_PERMISSIONS, in its order.
//
// `resource` and `action` are the two halves of the slug, which is how
// `can(user, "orders", "manage")` reads it on the frontend; the `@@unique
// ([resource, action])` in the schema is the same fact.
// ---------------------------------------------------------------------------

export const permissions = [
  ["orders.view", "See every order on the platform"],
  ["orders.manage", "Intervene in an order: reassign, cancel, force a state"],
  ["refunds.manage", "Approve and settle refunds"],
  ["restaurants.view", "See restaurant accounts and their applications"],
  ["restaurants.approve", "Approve, reject or suspend a restaurant"],
  ["riders.view", "See rider accounts and their applications"],
  ["riders.approve", "Approve, reject or suspend a rider"],
  ["customers.view", "See customer accounts and their history"],
  ["customers.manage", "Edit, block or unblock a customer"],
  ["support.view", "Read support tickets and disputes"],
  ["support.manage", "Reply to, escalate and close support tickets"],
  ["payouts.view", "See settlement runs and payout lines"],
  ["payouts.manage", "Run a settlement and release a payout"],
  ["coupons.manage", "Create and withdraw coupons and offers"],
  ["reviews.moderate", "Hide, restore and annotate reviews"],
  ["content.manage", "Edit CMS collections, pages and the blog"],
  ["notifications.send", "Broadcast announcements and promotions"],
  ["analytics.view", "Read platform analytics and reports"],
  ["audit.view", "Read the platform audit log"],
  ["settings.manage", "Change platform settings, feature flags and regions"],
].map(([slug, description]) => {
  const [resource, action] = slug.split(".");
  return { slug, resource, action, description };
});

// ---------------------------------------------------------------------------
// Roles — types/user.ts::UserRole (the fourteen `builtin` values) and
// lib/rbac.ts::ROLE_PERMISSIONS (what each grants).
//
// The empty grant lists are deliberate and are copied verbatim: a customer, a
// rider and a restaurant owner hold **no platform rights at all**, because
// everything they can do they do to their own records through their own
// surfaces. Granting `orders.view` to a restaurant owner would be granting them
// every order on the platform.
//
// `rank` is new here — the schema has the column and the frontend has no
// equivalent. It is ordered by blast radius, which is what the column's own
// comment ("higher wins; also gates 'can edit this role'") asks for.
// ---------------------------------------------------------------------------

const ALL_PERMISSIONS = permissions.map((permission) => permission.slug);

export const roles = [
  { slug: "guest", builtin: "guest", name: "Guest", rank: 0, grants: [] },
  { slug: "customer", builtin: "customer", name: "Customer", rank: 10, grants: [] },
  { slug: "restaurant-owner", builtin: "restaurant-owner", name: "Restaurant owner", rank: 20, grants: [] },
  { slug: "cafe-owner", builtin: "cafe-owner", name: "Café owner", rank: 20, grants: [] },
  { slug: "home-chef", builtin: "home-chef", name: "Home chef", rank: 20, grants: [] },
  { slug: "cloud-kitchen", builtin: "cloud-kitchen", name: "Cloud kitchen", rank: 20, grants: [] },
  { slug: "catering-company", builtin: "catering-company", name: "Catering company", rank: 20, grants: [] },
  { slug: "delivery-rider", builtin: "delivery-rider", name: "Delivery rider", rank: 20, grants: [] },
  {
    slug: "vendor-manager",
    builtin: "vendor-manager",
    name: "Partner operations",
    description: "Onboards and looks after restaurants and riders. Reads orders for context; touches no money.",
    rank: 40,
    grants: ["orders.view", "restaurants.view", "restaurants.approve", "riders.view", "riders.approve", "analytics.view"],
  },
  {
    slug: "customer-support",
    builtin: "customer-support",
    name: "Customer support",
    description: "Finds the order, finds the person, intervenes, and gives the money back. May not approve or pay a partner.",
    rank: 40,
    grants: [
      "orders.view",
      "orders.manage",
      "refunds.manage",
      "customers.view",
      "customers.manage",
      "support.view",
      "support.manage",
      "restaurants.view",
      "riders.view",
    ],
  },
  {
    slug: "moderator",
    builtin: "moderator",
    name: "Moderator",
    description: "Reviews, and the context needed to judge one. Not the customer's account — blocking belongs to support.",
    rank: 40,
    grants: ["reviews.moderate", "orders.view", "customers.view", "restaurants.view", "support.view"],
  },
  {
    slug: "finance-manager",
    builtin: "finance-manager",
    name: "Finance manager",
    description: "Settlements, transfers, refunds, and the audit trail that shows what was paid and by whom.",
    rank: 50,
    grants: [
      "orders.view",
      "refunds.manage",
      "payouts.view",
      "payouts.manage",
      "restaurants.view",
      "riders.view",
      "analytics.view",
      "audit.view",
    ],
  },
  {
    slug: "marketing-manager",
    builtin: "marketing-manager",
    name: "Marketing manager",
    description: "Campaigns, broadcasts, the content desk, and the numbers.",
    rank: 40,
    grants: ["coupons.manage", "notifications.send", "content.manage", "customers.view", "orders.view", "analytics.view"],
  },
  {
    slug: "super-admin",
    builtin: "super-admin",
    name: "Super admin",
    description: "Everything.",
    rank: 100,
    grants: ALL_PERMISSIONS,
  },
];

// ---------------------------------------------------------------------------
// Delivery zones — lib/mock/delivery-zones.ts, with centroids from
// lib/mock/drop-points.ts.
//
// The centroids matter more than they look: `ZoneArea.lat/lng` is what the
// dispatch bridge uses to place a stop for an order whose address carries no
// coordinates, and BACKEND-REQUIREMENTS §2 calls the seeder out by name for it
// ("DeliveryZone + ZoneArea **with centroids**"). An area with no centroid is an
// area a real order cannot be routed to.
//
// `customerBaseFee` / `customerPerKm` are left at the schema's 0. The customer's
// delivery charge is a *vendor* property today (`lib/cart.deliveryFeeFor` reads
// `vendor.deliveryFee` and `vendor.freeDeliveryOver`); putting a number here
// would invent a second pricing basis before the module that has to choose
// between them exists.
// ---------------------------------------------------------------------------

export const deliveryZones = [
  {
    id: "dzn_gulshan",
    name: "Gulshan – Banani – Baridhara",
    city: "Dhaka",
    countryCode: "BD",
    currency: "BDT",
    lat: "23.7900000",
    lng: "90.4130000",
    baseFare: "45.00",
    perKm: "12.00",
    peakMultiplier: "1.2500",
    peakHours: [12, 13, 19, 20, 21],
    batchBonus: "25.00",
    cashLimit: "3000.00",
    deliveryRadiusKm: "8.00",
    areas: [
      { label: "Gulshan 1", lat: "23.7793000", lng: "90.4165000" },
      { label: "Gulshan 2", lat: "23.7948000", lng: "90.4172000" },
      { label: "Banani", lat: "23.7942000", lng: "90.4009000" },
      { label: "Baridhara", lat: "23.8062000", lng: "90.4238000" },
      { label: "Bashundhara R/A", lat: "23.8156000", lng: "90.4362000" },
      { label: "Mohakhali", lat: "23.7801000", lng: "90.3998000" },
      { label: "Niketan", lat: "23.7771000", lng: "90.4121000" },
      { label: "Badda", lat: "23.7838000", lng: "90.4271000" },
    ],
  },
  {
    id: "dzn_dhanmondi",
    name: "Dhanmondi – Mohammadpur",
    city: "Dhaka",
    countryCode: "BD",
    currency: "BDT",
    lat: "23.7530000",
    lng: "90.3760000",
    baseFare: "40.00",
    perKm: "11.00",
    peakMultiplier: "1.2000",
    peakHours: [13, 14, 20, 21],
    batchBonus: "20.00",
    cashLimit: "2500.00",
    deliveryRadiusKm: "8.00",
    areas: [
      // Two drop points share the label "Dhanmondi"; the area is one row, and
      // the centroid is the first of them — `dropPointFor` resolves the same way.
      { label: "Dhanmondi", lat: "23.7566000", lng: "90.3729000" },
      { label: "Kalabagan", lat: "23.7495000", lng: "90.3841000" },
      { label: "Mohammadpur", lat: "23.7671000", lng: "90.3603000" },
      { label: "Shantinagar", lat: "23.7398000", lng: "90.4135000" },
      { label: "Tejgaon", lat: "23.7657000", lng: "90.3921000" },
      { label: "Lalmatia", lat: "23.7602000", lng: "90.3672000" },
    ],
  },
  {
    id: "dzn_uttara",
    name: "Uttara – Mirpur",
    city: "Dhaka",
    countryCode: "BD",
    currency: "BDT",
    lat: "23.8500000",
    lng: "90.3760000",
    baseFare: "50.00",
    perKm: "14.00",
    peakMultiplier: "1.1500",
    peakHours: [12, 13, 20],
    batchBonus: "30.00",
    cashLimit: "3500.00",
    deliveryRadiusKm: "7.00",
    areas: [
      { label: "Uttara Sector 4", lat: "23.8628000", lng: "90.3985000" },
      { label: "Uttara Sector 7", lat: "23.8741000", lng: "90.3812000" },
      { label: "Mirpur 10", lat: "23.8072000", lng: "90.3691000" },
      { label: "Pallabi", lat: "23.8248000", lng: "90.3652000" },
      { label: "Kalshi", lat: "23.8291000", lng: "90.3789000" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Payment providers.
//
// `types/order.ts::PaymentMethod` is `"cash" | "card" | "wallet"`, so cash and
// wallet are the two the platform can actually settle today and both are
// enabled. The three Bangladeshi gateways are seeded **disabled and in test
// mode**, with `credentialRefs` naming secret-manager keys rather than holding
// secrets — a provider row is a switch the payments module reads, and a switch
// that has to be created before it can be flipped is a deployment step nobody
// documents. "card" reaches the platform through one of them.
// ---------------------------------------------------------------------------

export const paymentProviders = [
  {
    kind: "cash",
    displayName: "Cash on delivery",
    countryCodes: [],
    currencies: [],
    capabilities: ["charge", "refund", "partial-refund"],
    priority: 10,
    isEnabled: true,
    isTestMode: false,
    credentialRefs: {},
  },
  {
    kind: "wallet",
    displayName: "FoodOra wallet",
    countryCodes: [],
    currencies: [],
    capabilities: ["charge", "refund", "partial-refund"],
    priority: 20,
    isEnabled: true,
    isTestMode: false,
    credentialRefs: {},
  },
  {
    kind: "bkash",
    displayName: "bKash",
    countryCodes: ["BD"],
    currencies: ["BDT"],
    capabilities: ["charge", "refund", "webhook"],
    priority: 30,
    isEnabled: false,
    isTestMode: true,
    credentialRefs: { appKey: "BKASH_APP_KEY", appSecret: "BKASH_APP_SECRET" },
  },
  {
    kind: "nagad",
    displayName: "Nagad",
    countryCodes: ["BD"],
    currencies: ["BDT"],
    capabilities: ["charge", "refund", "webhook"],
    priority: 40,
    isEnabled: false,
    isTestMode: true,
    credentialRefs: { merchantId: "NAGAD_MERCHANT_ID", privateKey: "NAGAD_PRIVATE_KEY" },
  },
  {
    kind: "sslcommerz",
    displayName: "SSLCOMMERZ",
    countryCodes: ["BD"],
    currencies: ["BDT"],
    capabilities: ["charge", "refund", "partial-refund", "webhook", "three-ds"],
    priority: 50,
    isEnabled: false,
    isTestMode: true,
    credentialRefs: { storeId: "SSLCOMMERZ_STORE_ID", storePassword: "SSLCOMMERZ_STORE_PASSWORD" },
  },
];

// ---------------------------------------------------------------------------
// Ledger accounts — the platform's own, one per currency the platform trades in.
//
// Only the platform-owned kinds. `vendor-payable`, `rider-payable`,
// `rider-cash-held` and `customer-wallet` carry an `ownerId` and are minted with
// the vendor, rider or customer they belong to — seeding them here would mean
// inventing owners, which §5 of the phase brief rules out.
//
// A partial unique index (`ledger_accounts_platform_uq`) already enforces one
// row per (kind, currency) where `ownerId IS NULL`, which is why this is an
// insert-if-absent rather than an upsert: Prisma cannot address a partial index.
// ---------------------------------------------------------------------------

export const platformLedgerAccountKinds = [
  "platform-revenue",
  "platform-cash",
  "tax-payable",
  "gateway-fees",
  "promotions",
  "suspense",
];
