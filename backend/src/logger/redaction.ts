/**
 * Redaction happens **at the logger**, not at the call site (D10 §Monitoring).
 *
 * Redaction that depends on every developer remembering to strip a field before
 * logging it is redaction that fails — usually at 3am, in an incident, in a log
 * aggregator a support contractor can read. Listing the paths once means a new
 * `logger.info({ user })` cannot leak a phone number even if nobody thought
 * about it.
 *
 * Under GDPR-style rules and Bangladesh's payment regulations alike, the phone
 * number and the email ARE the personal data — they are not "less sensitive"
 * than the password, they are the identifier an attacker actually wants.
 */
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'apiKey',
  'secret',
  'clientSecret',
  'privateKey',
  'otp',
  'otpHash',
  'pepper',
  'pin',
  'cvv',
  'cardNumber',
  'card',
  'phone',
  'phoneNumber',
  'email',
  'contactPhone',
  'contactEmail',
] as const;

/**
 * Pino needs literal paths, so each key is listed at the request/response roots
 * and one level into the usual carriers (`body`, `variables`, `input`, `user`).
 * The GraphQL variables path matters most: that is where a login mutation's
 * password actually travels.
 */
function pathsFor(root: string): string[] {
  return SENSITIVE_KEYS.flatMap((key) => [
    `${root}.${key}`,
    `${root}.*.${key}`,
    `${root}.*.*.${key}`,
  ]);
}

export const REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["proxy-authorization"]',
  'res.headers["set-cookie"]',
  ...pathsFor('req.body'),
  ...pathsFor('variables'),
  ...pathsFor('input'),
  ...pathsFor('user'),
  ...pathsFor('actor'),
  ...pathsFor('payload'),
  ...SENSITIVE_KEYS.map((key) => key),
];

export const REDACT_CENSOR = '[redacted]';
