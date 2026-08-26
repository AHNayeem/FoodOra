import {
  isRequiredChannel,
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  NOTIFICATION_TOPICS,
  type NotificationTopic,
} from '../../../../shared/enums';
import type { CustomerSettings, SettingsPatch } from '../models';

/**
 * The customer settings algebra: defaults, merge, and the channels that cannot be turned
 * off. Pure, because it is entirely a set of rules about a shape.
 */

/**
 * `frontend/lib/mock/settings.ts::defaultCustomerSettings`, value for value.
 *
 * Opinionated rather than all-on, and the asymmetry is the product's promise: everything
 * transactional is enabled because the customer asked for the order, and everything
 * promotional starts off, because opting people into marketing by default is precisely the
 * behaviour the privacy page says we do not have.
 *
 * These are also the values the *database* defaults to (`UserSettings` and
 * `NotificationPreference` carry them as column defaults), so a row created by any path
 * agrees with a row created by this one.
 */
export function defaultSettings(): CustomerSettings {
  return {
    notifications: {
      // Receipts and status changes — email is locked on, see `REQUIRED_CHANNELS`.
      orderUpdates: { email: true, push: true, sms: false },
      // "Rider is 2 minutes away" — push only, since SMS for this is noisy.
      deliveryAlerts: { email: false, push: true, sms: false },
      promotions: { email: false, push: false, sms: false },
      newVendors: { email: false, push: false, sms: false },
      weeklyDigest: { email: false, push: false, sms: false },
    },
    privacy: {
      personalizedRecommendations: true,
      shareOrderActivity: false,
      saveSearchHistory: true,
    },
    security: {
      loginAlerts: true,
      twoFactor: false,
    },
  };
}

/**
 * Apply a partial write to a full settings object.
 *
 * A patch merge rather than a replacement, because the settings page saves one toggle at a
 * time and a replacement would let two tabs silently undo each other's changes — the second
 * save carrying a stale copy of everything the first one changed.
 */
export function mergeSettings(current: CustomerSettings, patch: SettingsPatch): CustomerSettings {
  const notifications = { ...current.notifications };

  for (const topic of NOTIFICATION_TOPICS) {
    const incoming = patch.notifications?.[topic];
    if (!incoming) continue;

    const channels = { ...notifications[topic] };
    for (const channel of NOTIFICATION_CHANNELS) {
      const value = incoming[channel];
      if (value !== undefined) channels[channel] = value;
    }
    notifications[topic] = channels;
  }

  return {
    notifications: enforceRequiredChannels(notifications),
    privacy: { ...current.privacy, ...patch.privacy },
    security: { ...current.security, ...patch.security },
  };
}

/**
 * Force on every channel the platform is obliged to send, whatever the input said.
 *
 * The UI renders these as locked controls, and this is what makes that honest. It corrects
 * rather than refuses, deliberately: a client that posts `orderUpdates.email = false` — by
 * bug, by a stale form, or by hand — should get its receipts and a settings object showing
 * the switch still on, not a validation error on a control the user was never able to touch.
 */
export function enforceRequiredChannels(
  notifications: CustomerSettings['notifications'],
): CustomerSettings['notifications'] {
  const corrected = { ...notifications };

  for (const topic of NOTIFICATION_TOPICS) {
    const channels = { ...corrected[topic] };
    let changed = false;
    for (const channel of NOTIFICATION_CHANNELS) {
      if (isRequiredChannel(topic, channel) && !channels[channel]) {
        channels[channel] = true;
        changed = true;
      }
    }
    if (changed) corrected[topic] = channels;
  }

  return corrected;
}

/**
 * Whether a patch tried to switch off something required — for reporting, not for refusing.
 *
 * `enforceRequiredChannels` already corrects it. This exists so the write path can log the
 * attempt: a client repeatedly trying to disable order receipts is either a bug worth
 * finding or a UI that is lying to somebody about what they just turned off.
 */
export function attemptedRequiredOptOut(
  patch: SettingsPatch,
): Array<readonly [NotificationTopic, NotificationChannel]> {
  const attempts: Array<readonly [NotificationTopic, NotificationChannel]> = [];
  for (const topic of NOTIFICATION_TOPICS) {
    const incoming = patch.notifications?.[topic];
    if (!incoming) continue;
    for (const channel of NOTIFICATION_CHANNELS) {
      if (incoming[channel] === false && isRequiredChannel(topic, channel)) {
        attempts.push([topic, channel]);
      }
    }
  }
  return attempts;
}
