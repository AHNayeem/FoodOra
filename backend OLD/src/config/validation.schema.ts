import { z } from 'zod';

/**
 * The environment contract, enforced at boot.
 *
 * `docs/backend/.env.example` documents the shape; this file is what makes the
 * documentation binding. A malformed `PORT` or a missing `DATABASE_URL` kills
 * the process during bootstrap — never the first request that happens to need
 * it (D1 §Config, D10 §Environments).
 *
 * Requiredness is graded by environment. Secrets for subsystems that do not
 * exist yet (payments arrive in E7, FCM in E8) must not block a developer from
 * booting E1, but they must block a production pod. `requiredInProduction`
 * expresses exactly that, and the check is a hard failure, not a warning.
 */

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

/** "15m" | "30d" | "5m" — the format jsonwebtoken and BullMQ both accept. */
const duration = (fallback: string) =>
  z
    .string()
    .regex(/^\d+[smhd]$/, 'expected a duration like "15m", "24h" or "30d"')
    .default(fallback);

const port = (fallback: number) => z.coerce.number().int().min(1).max(65535).default(fallback);

const optional = z.string().trim().default('');

export const environmentSchema = z.object({
  // --- app -------------------------------------------------------------------
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: port(4000),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().default('http://localhost:4000'),
  WEB_URL: z.string().default('http://localhost:3005'),
  CORS_ORIGINS: z.string().default('http://localhost:3005'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  LOG_PRETTY: bool(false),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(0).default(15_000),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
  DEFAULT_COUNTRY: z.string().length(2).default('BD'),
  DEFAULT_CURRENCY: z.string().length(3).default('BDT'),
  DEFAULT_LOCALE: z.string().min(2).max(5).default('en'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Dhaka'),

  // --- database (REQUIRED everywhere) ---------------------------------------
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_DIRECT_URL: optional,
  DATABASE_REPLICA_URL: optional,
  DATABASE_LOG_QUERIES: bool(false),
  DATABASE_SLOW_QUERY_MS: z.coerce.number().int().min(1).default(500),
  DATABASE_CONNECT_RETRIES: z.coerce.number().int().min(0).default(5),
  DATABASE_CONNECT_RETRY_MS: z.coerce.number().int().min(50).default(2_000),

  // --- redis (REQUIRED everywhere) ------------------------------------------
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  REDIS_QUEUE_URL: optional,
  REDIS_PUBSUB_URL: optional,
  REDIS_KEY_PREFIX: z.string().default('foodora:'),

  // --- auth (REQUIRED in production) ----------------------------------------
  JWT_PRIVATE_KEY: optional,
  JWT_PUBLIC_KEY: optional,
  JWT_KEY_ID: z.string().default('k1'),
  /**
   * The key being rotated *out*. While set, JWKS publishes both and a token
   * signed with the old `kid` still verifies — which is what makes rotation a
   * deploy rather than a forced sign-out of every user (D6 §Token model).
   */
  JWT_PREVIOUS_PUBLIC_KEY: optional,
  JWT_PREVIOUS_KEY_ID: optional,
  JWT_ISSUER: z.string().default('foodora'),
  JWT_AUDIENCE: z.string().default('foodora-api'),
  ACCESS_TOKEN_TTL: duration('15m'),
  REFRESH_TOKEN_TTL: duration('30d'),
  REFRESH_TOKEN_TTL_SHORT: duration('7d'),
  PASSWORD_RESET_TTL: duration('30m'),
  OTP_TTL: duration('5m'),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  OTP_PEPPER: optional,
  /**
   * Non-production only: print the OTP to the log instead of pretending an SMS
   * was sent. E8 supplies a real transport; until then this is how a developer
   * completes the flow. Refused in production by `validateEnvironment`.
   */
  OTP_LOG_CODES: bool(true),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(8192).default(19_456),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),
  COOKIE_DOMAIN: z.string().default('localhost'),
  /**
   * The refresh cookie's `Path`. `/auth` means the browser never sends it to
   * `/graphql`, so the GraphQL endpoint is not cookie-authenticated and
   * therefore not CSRF-able (D6 §Cookies).
   */
  AUTH_COOKIE_PATH: z.string().default('/auth'),
  /**
   * How long a completed rotation's result is replayable, so two tabs
   * refreshing at once do not read as token theft. See
   * `TokenService.rotateRefreshToken`.
   */
  REFRESH_REPLAY_WINDOW_MS: z.coerce.number().int().min(0).max(60_000).default(10_000),

  // --- social login (E2) -----------------------------------------------------
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  APPLE_CLIENT_ID: optional,
  APPLE_TEAM_ID: optional,
  APPLE_KEY_ID: optional,
  APPLE_PRIVATE_KEY: optional,
  FACEBOOK_APP_ID: optional,
  FACEBOOK_APP_SECRET: optional,

  // --- object storage (REQUIRED in production) -------------------------------
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_BUCKET_PUBLIC: z.string().default('foodora-public'),
  S3_BUCKET_PRIVATE: z.string().default('foodora-private'),
  S3_FORCE_PATH_STYLE: bool(true),
  CDN_BASE_URL: z.string().default('http://localhost:9000/foodora-public'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().min(1).default(10_485_760),
  UPLOAD_URL_TTL: z.coerce.number().int().min(30).default(300),

  // --- payments (E7) ---------------------------------------------------------
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  SSLCOMMERZ_STORE_ID: optional,
  SSLCOMMERZ_STORE_PASSWORD: optional,
  SSLCOMMERZ_SANDBOX: bool(true),
  BKASH_APP_KEY: optional,
  BKASH_APP_SECRET: optional,
  BKASH_USERNAME: optional,
  BKASH_PASSWORD: optional,
  NAGAD_MERCHANT_ID: optional,
  NAGAD_PRIVATE_KEY: optional,
  NAGAD_PUBLIC_KEY: optional,
  ROCKET_MERCHANT_ID: optional,
  ROCKET_API_KEY: optional,
  PAYPAL_CLIENT_ID: optional,
  PAYPAL_CLIENT_SECRET: optional,

  // --- notifications (E8) ----------------------------------------------------
  FIREBASE_PROJECT_ID: optional,
  FIREBASE_CLIENT_EMAIL: optional,
  FIREBASE_PRIVATE_KEY: optional,
  WEB_PUSH_VAPID_PUBLIC_KEY: optional,
  WEB_PUSH_VAPID_PRIVATE_KEY: optional,
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: port(1025),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  SMTP_FROM: z.string().default('FoodOra <no-reply@foodora.app>'),
  SMS_PROVIDER: z.enum(['log', 'twilio', 'local']).default('log'),
  SMS_API_KEY: optional,
  SMS_SENDER_ID: z.string().default('FOODORA'),

  // --- catalog listing (V1) --------------------------------------------------
  /**
   * How many vendor rows the repository may hand the application layer for one
   * listing request.
   *
   * `openNow` and two of the four sorts cannot be expressed in SQL — `openNow` is the
   * whole `isOpenNow` computation, `delivery-time` orders by a column on the to-many
   * `branches`, `distance` needs the caller's origin — so the repository narrows what
   * it can and the service finishes the job in memory. This is the size of that
   * working set, and it is a real trade rather than a tuning knob: above it `total`
   * becomes a floor and late pages may be short, and below it the same is true sooner.
   * It is configurable because the right number is a property of the deployment's
   * catalogue size, not of this code — 500 is right for one city and wrong for thirty.
   */
  CATALOG_CANDIDATE_LIMIT: z.coerce.number().int().min(1).max(50_000).default(500),
  /** Ceiling on `trendingVendors(limit:)` and friends, so a rail cannot request a table. */
  CATALOG_RAIL_LIMIT: z.coerce.number().int().min(1).max(500).default(50),
  /** `catalog:rails` — the cuisine and category lists. 0 disables the entry. */
  CATALOG_RAILS_TTL_SECONDS: z.coerce.number().int().min(0).default(900),
  /**
   * `catalog:menu:*` and `catalog:food:*`. Shorter than the rails because a menu is
   * edited by a restaurant during service, while a category tile is edited by an
   * operator before a campaign. 0 disables both entries.
   */
  CATALOG_MENU_TTL_SECONDS: z.coerce.number().int().min(0).default(300),

  // --- routing (distance & ETA) ----------------------------------------------
  /**
   * Who answers "how far is it".
   *
   * Distinct from `MAPS_PROVIDER`, which is about *showing* a map — tiles, geocoding,
   * a marker on the tracking screen. Routing is about *measuring* a path, it is billed
   * per element rather than per view, and the two are routinely bought from different
   * vendors. Only `haversine` is implemented; selecting any other aborts the boot
   * rather than quietly computing a straight line, because a config that claims
   * `google` while returning great-circle distance is a lie a fare will be built on.
   */
  ROUTING_PROVIDER: z
    .enum(['haversine', 'google', 'osrm', 'mapbox', 'openrouteservice'])
    .default('haversine'),
  ROUTING_API_KEY: optional,
  /** Base URL for a self-hosted provider (OSRM in particular). */
  ROUTING_BASE_URL: optional,
  ROUTING_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),

  // --- cart (V1 Unit 2) ------------------------------------------------------
  /** Distinct configurations in one basket. A cart is a basket, not a catalogue. */
  CART_MAX_LINES: z.coerce.number().int().min(1).max(500).default(50),
  /** Units of one configuration. A caterer's order is a catering quote, not a cart. */
  CART_MAX_LINE_QUANTITY: z.coerce.number().int().min(1).max(999).default(20),
  /**
   * How long an untouched cart survives before `expiresAt` marks it collectable. A
   * basket abandoned on Friday priced at Friday's menu should not resurface in
   * October; nothing sweeps it yet, so this only stamps the column.
   */
  CART_TTL_HOURS: z.coerce.number().int().min(1).max(8_760).default(72),

  // --- checkout (V1 Unit 3) --------------------------------------------------
  /** Tip ceiling as a fraction of the subtotal. 1 = a 100% tip is the most allowed. */
  CHECKOUT_MAX_TIP_PERCENT: z.coerce.number().min(0).max(10).default(1),
  CHECKOUT_DEFAULT_ETA_MINUTES: z.coerce.number().int().min(1).max(1_440).default(40),
  CHECKOUT_OTP_DIGITS: z.coerce.number().int().min(4).max(8).default(4),
  CHECKOUT_OTP_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),

  // --- maps / ai -------------------------------------------------------------
  MAPS_PROVIDER: z.enum(['none', 'google', 'mapbox']).default('none'),
  MAPS_API_KEY: optional,
  AI_PROVIDER: z.string().default('local'),
  AI_API_KEY: optional,
  AI_MODEL: optional,
  AI_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(0),

  // --- graphql / limits ------------------------------------------------------
  GRAPHQL_PATH: z.string().default('/graphql'),
  GRAPHQL_PLAYGROUND: bool(true),
  GRAPHQL_INTROSPECTION: bool(true),
  GRAPHQL_MAX_DEPTH: z.coerce.number().int().min(1).default(10),
  GRAPHQL_MAX_COMPLEXITY: z.coerce.number().int().min(1).default(1000),
  GRAPHQL_MAX_COMPLEXITY_ANONYMOUS: z.coerce.number().int().min(1).default(300),
  GRAPHQL_SCHEMA_FILE: z.string().default('schema.gql'),
  /**
   * May this process overwrite `GRAPHQL_SCHEMA_FILE`?
   *
   * Only `schema:emit` / `schema:check` set it. Off by default so that starting the
   * server — in particular `start:dev`, which recompiles on every keystroke — cannot
   * rewrite a committed, reviewed artifact as a side effect of being run. See
   * `graphql.module.ts` for why the two writers disagreed in the first place.
   */
  GRAPHQL_SCHEMA_EMIT: bool(false),
  RATE_LIMIT_AUTHENTICATED: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_ANONYMOUS: z.coerce.number().int().min(1).default(60),

  // --- observability ---------------------------------------------------------
  OTEL_EXPORTER_OTLP_ENDPOINT: optional,
  OTEL_SERVICE_NAME: z.string().default('foodora-api'),
  SENTRY_DSN: optional,
  METRICS_ENABLED: bool(true),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * Keys that may be blank while a developer is working on an earlier phase, but
 * whose absence in production is a defect rather than a choice. Listed with the
 * phase that starts using them, so the list is auditable rather than folklore.
 */
const requiredInProduction: ReadonlyArray<[keyof Environment, string]> = [
  ['JWT_PRIVATE_KEY', 'E2 — RS256 signing key'],
  ['JWT_PUBLIC_KEY', 'E2 — RS256 verification key'],
  ['OTP_PEPPER', 'E2 — server-side pepper for OTP hashes'],
  ['DATABASE_DIRECT_URL', 'migrations must bypass PgBouncer'],
  ['S3_ACCESS_KEY_ID', 'E4 — media uploads'],
  ['S3_SECRET_ACCESS_KEY', 'E4 — media uploads'],
];

/** Settings that are conveniences locally and holes in production. */
const mustBeOffInProduction: ReadonlyArray<[keyof Environment, string]> = [
  ['GRAPHQL_PLAYGROUND', 'the playground must not be reachable in production'],
  ['GRAPHQL_INTROSPECTION', 'introspection must be off in production (D10)'],
  ['OTP_LOG_CODES', 'an OTP in the log is an OTP in the log aggregator (E2)'],
];

/**
 * `ConfigModule.forRoot({ validate })` hands us the raw environment and takes
 * back the parsed one. Throwing here aborts the bootstrap.
 */
export function validateEnvironment(raw: Record<string, unknown>): Environment {
  const parsed = environmentSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment — the process cannot start.\n${issues}\n\n` +
        `See docs/backend/.env.example for the full contract.`,
    );
  }

  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    const missing = requiredInProduction
      .filter(([key]) => !env[key])
      .map(([key, why]) => `  • ${key} — ${why}`);

    const unsafe = mustBeOffInProduction
      .filter(([key]) => env[key] === true)
      .map(([key, why]) => `  • ${key} — ${why}`);

    if (missing.length || unsafe.length) {
      throw new Error(
        [
          'Invalid production environment — the process cannot start.',
          missing.length ? `Missing:\n${missing.join('\n')}` : '',
          unsafe.length ? `Unsafe:\n${unsafe.join('\n')}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
  }

  return env;
}
