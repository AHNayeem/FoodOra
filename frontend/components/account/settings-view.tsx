"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, Lock, ShieldCheck } from "lucide-react";
import type {
  CustomerSettings,
  NotificationChannels,
  NotificationTopic,
} from "@/types";
import {
  getSettings,
  REQUIRED_NOTIFICATIONS,
  updateSettings,
} from "@/services/settings";
import { useSettings } from "@/stores/settings";
import { AppearanceCard } from "@/components/account/settings/appearance-card";
import { DangerZoneCard } from "@/components/account/settings/danger-zone-card";
import { PasswordCard } from "@/components/account/settings/password-card";
import { PushCard } from "@/components/notifications/push-card";
import {
  RowGroup,
  SettingsSection,
  SwitchRow,
} from "@/components/account/settings/settings-primitives";
import { cn } from "@/lib/utils";

const TOPICS: NotificationTopic[] = [
  "orderUpdates",
  "deliveryAlerts",
  "promotions",
  "newVendors",
  "weeklyDigest",
];

const CHANNELS: (keyof NotificationChannels)[] = ["email", "push", "sms"];

/** Channels the customer can't switch off, as a set for O(1) lookup. */
const REQUIRED = new Set(REQUIRED_NOTIFICATIONS.map(([topic, channel]) => `${topic}.${channel}`));

/**
 * SettingsView — account settings (Phase C28).
 *
 * Every control saves on change: there is no Save button, so nothing is lost by
 * navigating away. Each edit is applied optimistically, sent to the service, and
 * then replaced by whatever the service echoed back — the same commit-the-
 * server's-answer pattern the profile form uses, so a rejected write can roll the
 * UI back rather than leave it lying.
 *
 * Appearance, password and the danger zone are their own cards because they
 * write to different owners (the theme/locale/user record, the credential
 * endpoint, and every persisted store respectively).
 */
export function SettingsView() {
  const t = useTranslations("settings");
  const settings = useSettings((s) => s.settings);
  const hydrated = useSettings((s) => s.hydrated);
  const seeded = useSettings((s) => s.seeded);
  const seed = useSettings((s) => s.seed);
  const apply = useSettings((s) => s.apply);

  useEffect(() => {
    useSettings.persist.rehydrate();
  }, []);
  useEffect(() => {
    if (hydrated && !seeded) getSettings().then(seed);
  }, [hydrated, seeded, seed]);

  if (!hydrated || !settings) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  /** Optimistic write, then reconcile with the service's answer. */
  function save(next: CustomerSettings, previous: CustomerSettings) {
    apply(next);
    updateSettings(next).then((res) => {
      if (res.error || !res.data) {
        apply(previous);
        toast.error(t("saveError"));
        return;
      }
      apply(res.data);
    });
  }

  function setChannel(
    topic: NotificationTopic,
    channel: keyof NotificationChannels,
    value: boolean,
  ) {
    if (!settings) return;
    save(
      {
        ...settings,
        notifications: {
          ...settings.notifications,
          [topic]: { ...settings.notifications[topic], [channel]: value },
        },
      },
      settings,
    );
  }

  function setPrivacy(key: keyof CustomerSettings["privacy"], value: boolean) {
    if (!settings) return;
    save({ ...settings, privacy: { ...settings.privacy, [key]: value } }, settings);
  }

  function setSecurity(key: keyof CustomerSettings["security"], value: boolean) {
    if (!settings) return;
    save({ ...settings, security: { ...settings.security, [key]: value } }, settings);
  }

  return (
    <div className="space-y-5">
      <AppearanceCard />

      {/* Notifications: topics × channels. A table, because that is what it is —
          and the header row then labels every checkbox in its column. */}
      <SettingsSection
        icon={<Bell className="size-4.5" aria-hidden />}
        title={t("notificationsTitle")}
        description={t("notificationsDescription")}
      >
        <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[26rem] border-collapse text-start">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="pb-2 text-start text-xs font-bold uppercase tracking-wide text-muted">
                  {t("topic")}
                </th>
                {CHANNELS.map((channel) => (
                  <th
                    key={channel}
                    scope="col"
                    className="w-20 pb-2 text-center text-xs font-bold uppercase tracking-wide text-muted"
                  >
                    {t(`channel.${channel}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {TOPICS.map((topic) => (
                <tr key={topic}>
                  <th scope="row" className="py-3 pe-4 text-start align-top">
                    <span className="block text-sm font-semibold text-ink">
                      {t(`topicLabel.${topic}`)}
                    </span>
                    <span className="mt-0.5 block text-xs font-normal text-muted">
                      {t(`topicHint.${topic}`)}
                    </span>
                  </th>
                  {CHANNELS.map((channel) => {
                    const locked = REQUIRED.has(`${topic}.${channel}`);
                    const checked = settings.notifications[topic][channel];
                    return (
                      <td key={channel} className="py-3 text-center align-top">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={(e) => setChannel(topic, channel, e.target.checked)}
                          aria-label={`${t(`topicLabel.${topic}`)} — ${t(`channel.${channel}`)}`}
                          title={locked ? t("channelLocked") : undefined}
                          className={cn(
                            "size-4 rounded border-line text-primary focus-visible:ring-2 focus-visible:ring-primary/30",
                            locked && "cursor-not-allowed opacity-60",
                          )}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">{t("channelLocked")}</p>
        {/* C25 made this table load-bearing: `channelsFor` reads it at emit, so
            a switch here changes what actually arrives — and the delivery log
            in the notification centre is where you can see it happen. */}
        <p className="mt-1.5 text-xs text-muted">
          {t.rich("channelsLive", {
            link: (chunks) => (
              <Link href="/account/notifications" className="font-semibold text-primary hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </SettingsSection>

      {/* The browser's own permission — the one channel this prototype can
          genuinely deliver on, so it gets a control rather than a checkbox. */}
      <PushCard />

      <SettingsSection
        icon={<Lock className="size-4.5" aria-hidden />}
        title={t("privacyTitle")}
        description={t("privacyDescription")}
      >
        <RowGroup>
          <SwitchRow
            label={t("personalizedTitle")}
            description={t("personalizedBody")}
            checked={settings.privacy.personalizedRecommendations}
            onChange={(v) => setPrivacy("personalizedRecommendations", v)}
          />
          <SwitchRow
            label={t("shareActivityTitle")}
            description={t("shareActivityBody")}
            checked={settings.privacy.shareOrderActivity}
            onChange={(v) => setPrivacy("shareOrderActivity", v)}
          />
          <SwitchRow
            label={t("searchHistoryTitle")}
            description={t("searchHistoryBody")}
            checked={settings.privacy.saveSearchHistory}
            onChange={(v) => setPrivacy("saveSearchHistory", v)}
          />
        </RowGroup>
      </SettingsSection>

      <SettingsSection
        icon={<ShieldCheck className="size-4.5" aria-hidden />}
        title={t("securityTitle")}
        description={t("securityDescription")}
      >
        <RowGroup>
          <SwitchRow
            label={t("loginAlertsTitle")}
            description={t("loginAlertsBody")}
            checked={settings.security.loginAlerts}
            onChange={(v) => setSecurity("loginAlerts", v)}
          />
          <SwitchRow
            label={t("twoFactorTitle")}
            description={t("twoFactorBody")}
            checked={settings.security.twoFactor}
            onChange={(v) => setSecurity("twoFactor", v)}
          />
        </RowGroup>
      </SettingsSection>

      <PasswordCard />
      <DangerZoneCard />
    </div>
  );
}
