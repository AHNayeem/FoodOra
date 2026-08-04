import { Injectable } from '@nestjs/common';

import { enumCodec, TransactionManager } from '../../../infrastructure/prisma';
import type { $Enums } from '../../../infrastructure/prisma/generated';
import { NOTIFICATION_TOPICS, type NotificationTopic } from '../../../shared/enums';
import {
  type CustomerSettings,
  defaultSettings,
  enforceRequiredChannels,
  type UserSettingsRepositoryPort,
} from '../domain';

const topics = enumCodec<NotificationTopic, $Enums.NotificationTopicKey>('NotificationTopicKey');

/**
 * Two tables behind one object.
 *
 * `UserSettings` holds the privacy and security flags; `NotificationPreference` is one row per
 * topic, because a topic can then be added without migrating every row's JSON (D2). That is the
 * right storage and the wrong shape for a settings page, so the assembly happens here — which is
 * exactly what a repository is for.
 */
@Injectable()
export class PrismaUserSettingsRepository implements UserSettingsRepositoryPort {
  constructor(private readonly transactions: TransactionManager) {}

  private get db() {
    return this.transactions.client;
  }

  /**
   * Never null.
   *
   * A missing `UserSettings` row or a missing topic row resolves to the default for that piece,
   * rather than to a null object the caller has to branch on. The column defaults in the schema
   * are the same values as `defaultSettings()`, so an account created by any path — E2's
   * registration, which creates the row, or a seed that does not — reads identically.
   */
  async read(userId: string): Promise<CustomerSettings> {
    const [flags, preferences] = await Promise.all([
      this.db.userSettings.findUnique({ where: { userId } }),
      this.db.notificationPreference.findMany({ where: { userId } }),
    ]);

    const settings = defaultSettings();

    if (flags) {
      settings.privacy = {
        personalizedRecommendations: flags.personalizedRecommendations,
        shareOrderActivity: flags.shareOrderActivity,
        saveSearchHistory: flags.saveSearchHistory,
      };
      settings.security = { loginAlerts: flags.loginAlerts, twoFactor: flags.twoFactor };
    }

    for (const row of preferences) {
      const topic = topics.toWire(row.topic);
      settings.notifications[topic] = { email: row.email, push: row.push, sms: row.sms };
    }

    // Enforced on **read** as well as on write, so a row written before a channel became
    // required — or by a migration, or by hand — still reports the truth about what we send.
    settings.notifications = enforceRequiredChannels(settings.notifications);
    return settings;
  }

  /**
   * The whole object, in one transaction.
   *
   * Six writes: one upsert for the flags and one per topic. `upsert` throughout rather than
   * `update`, because an account may have no rows yet — E2 creates `UserSettings` at
   * registration but nothing creates the preference rows until somebody saves the page, and
   * relying on that ordering would make the first save the one that fails.
   */
  async write(userId: string, settings: CustomerSettings): Promise<CustomerSettings> {
    const notifications = enforceRequiredChannels(settings.notifications);

    await this.transactions.runInTransaction(async () => {
      await this.db.userSettings.upsert({
        where: { userId },
        create: {
          userId,
          personalizedRecommendations: settings.privacy.personalizedRecommendations,
          shareOrderActivity: settings.privacy.shareOrderActivity,
          saveSearchHistory: settings.privacy.saveSearchHistory,
          loginAlerts: settings.security.loginAlerts,
          twoFactor: settings.security.twoFactor,
        },
        update: {
          personalizedRecommendations: settings.privacy.personalizedRecommendations,
          shareOrderActivity: settings.privacy.shareOrderActivity,
          saveSearchHistory: settings.privacy.saveSearchHistory,
          loginAlerts: settings.security.loginAlerts,
          twoFactor: settings.security.twoFactor,
        },
      });

      for (const topic of NOTIFICATION_TOPICS) {
        const channels = notifications[topic];
        const key = topics.toDb(topic);
        await this.db.notificationPreference.upsert({
          where: { userId_topic: { userId, topic: key } },
          create: {
            userId,
            topic: key,
            email: channels.email,
            push: channels.push,
            sms: channels.sms,
          },
          update: { email: channels.email, push: channels.push, sms: channels.sms },
        });
      }
    });

    return { ...settings, notifications };
  }
}
