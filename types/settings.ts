/**
 * settings.ts — the customer's account settings (Phase C28).
 *
 * Only preferences that need a *server* to mean anything live here: which
 * notifications to send and on what channel, what the platform may infer from
 * behaviour, and the security posture of the account. Theme, language and
 * currency are deliberately absent — those already have owners (the `.dark`
 * class + `foodora-theme`, the locale cookie, and the user record), and the
 * settings page drives those owners rather than keeping a second copy that
 * could disagree.
 */

/** Delivery channels a notification topic can use. */
export interface NotificationChannels {
  email: boolean;
  push: boolean;
  sms: boolean;
}

/** What we would notify about. Each is independently addressable per channel. */
export type NotificationTopic =
  | "orderUpdates"
  | "deliveryAlerts"
  | "promotions"
  | "newVendors"
  | "weeklyDigest";

export interface PrivacySettings {
  /** Use order history to personalise recommendations. */
  personalizedRecommendations: boolean;
  /** Let vendors see the display name attached to a review. */
  shareOrderActivity: boolean;
  /** Keep recent searches to speed up the next one. */
  saveSearchHistory: boolean;
}

export interface SecuritySettings {
  /** Email on a sign-in from an unrecognised device. */
  loginAlerts: boolean;
  /** Second factor on sign-in (SMS in the prototype). */
  twoFactor: boolean;
}

export interface CustomerSettings {
  notifications: Record<NotificationTopic, NotificationChannels>;
  privacy: PrivacySettings;
  security: SecuritySettings;
}
