"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { AppNotification, DeliveryChannel } from "@/frontend/types";
import { DELIVERY_CHANNELS } from "@/frontend/lib/notifications";
import { CATEGORY_ICON, CHANNEL_ICON, TONE_CLASS } from "./notification-meta";
import { useNotificationCopy } from "./notification-text";
import { cn } from "@/frontend/lib/utils";

/**
 * NotificationRow — one notification, drawn the one way.
 *
 * Used by the bell's popover and by the account centre, which differ only in
 * whether the delivery channels are shown: the popover is a glance and the
 * centre is a record, and "this also went to your email" is a record's job.
 */
export function NotificationRow({
  item,
  onOpen,
  showChannels = false,
}: {
  item: AppNotification;
  onOpen: (id: string) => void;
  showChannels?: boolean;
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const copy = useNotificationCopy();
  const Icon = CATEGORY_ICON[item.category];
  const { title, body } = copy(item);

  const delivered = DELIVERY_CHANNELS.filter((c) =>
    item.channels.includes(c),
  ) as DeliveryChannel[];

  return (
    <Link
      href={item.href}
      onClick={() => onOpen(item.id)}
      className={cn(
        "flex gap-3 px-4 py-3 transition-colors hover:bg-surface-muted",
        !item.read && "bg-primary/[0.04]",
      )}
    >
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-pill",
          TONE_CLASS[item.tone],
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 text-sm",
              item.read ? "font-medium text-body" : "font-bold text-ink",
            )}
          >
            {title}
          </span>
          {!item.read && (
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
              aria-label={t("unread")}
            />
          )}
        </span>

        <span className="mt-0.5 block text-xs text-muted">{body}</span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          <span>{format.relativeTime(new Date(item.at))}</span>
          {showChannels && delivered.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5">
                {delivered.map((channel) => {
                  const ChannelIcon = CHANNEL_ICON[channel];
                  return (
                    <span
                      key={channel}
                      title={t("alsoSent", { channel: t(`channel.${channel}`) })}
                      className="inline-flex items-center gap-1 rounded-pill bg-surface-muted px-1.5 py-0.5"
                    >
                      <ChannelIcon className="size-3" aria-hidden />
                      <span className="sr-only">
                        {t("alsoSent", { channel: t(`channel.${channel}`) })}
                      </span>
                    </span>
                  );
                })}
              </span>
            </>
          )}
        </span>
      </span>
    </Link>
  );
}
