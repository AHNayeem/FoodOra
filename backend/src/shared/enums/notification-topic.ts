/**
 * The notification preference matrix (`frontend/types/settings.ts`).
 *
 * These are **camelCase**, not kebab-case, and that is not an inconsistency: the
 * frontend uses them as object keys — `settings.notifications.orderUpdates.email`
 * — so `@map("orderUpdates")` on the Postgres enum is the value the client has
 * read since Phase C. Same reasoning as every other vocabulary here: the wire form
 * is whatever the frontend already says.
 */
export const NOTIFICATION_TOPICS = [
  'orderUpdates',
  'deliveryAlerts',
  'promotions',
  'newVendors',
  'weeklyDigest',
] as const;

export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

/** The three delivery channels a topic can use, per `NotificationChannels`. */
export const NOTIFICATION_CHANNELS = ['email', 'push', 'sms'] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Channels a customer may not switch off, because they carry the transactional
 * record of an order we are obliged to send.
 *
 * `frontend/services/settings.ts` exports the same pair as
 * `REQUIRED_NOTIFICATIONS` and renders those controls locked. The list lives here
 * too — deliberately duplicated rather than imported across the repo boundary —
 * because the UI showing a disabled switch is a courtesy and the server refusing
 * the write is the rule. A client that posts `orderUpdates.email = false`, by bug
 * or by hand, still gets its receipts.
 */
export const REQUIRED_CHANNELS: ReadonlyArray<readonly [NotificationTopic, NotificationChannel]> = [
  ['orderUpdates', 'email'],
];

export function isRequiredChannel(topic: NotificationTopic, channel: NotificationChannel): boolean {
  return REQUIRED_CHANNELS.some(([t, c]) => t === topic && c === channel);
}
