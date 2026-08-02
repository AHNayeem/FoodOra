"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  History,
  Megaphone,
  PenLine,
  Send,
  Users,
} from "lucide-react";
import type {
  BroadcastKind,
  DeliveryChannel,
  NotificationCampaign,
  NotificationDispatch,
  NotificationSegment,
  SegmentId,
} from "@/frontend/types";
import { DELIVERY_CHANNELS, SMS_LIMIT } from "@/frontend/lib/notifications";
import {
  TITLE_LIMIT,
  campaignTotals,
  getOutbox,
  getSegments,
  sendBroadcast,
} from "@/frontend/services/notifications";
import { emitNotifications, useNotifications } from "@/frontend/stores/notifications";
import {
  CHANNEL_ICON,
  DISPATCH_CLASS,
} from "@/frontend/components/notifications/notification-meta";
import {
  dispatchRenderable,
  useNotificationCopy,
} from "@/frontend/components/notifications/notification-text";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";

type Tab = "compose" | "campaigns" | "log";

/**
 * AdminNotificationCenter — the operator's side of notifications
 * (`/admin/notifications`, spec: Admin Panel → Notification Center).
 *
 * Three tabs, and the order is the workflow: write one, see what you have sent,
 * see what actually left the building.
 *
 * The composer's job is to make the **cost of a message visible before it is
 * sent**, which is why it is not just a title and a body. The segment shows its
 * size. The SMS counter is live and turns red at 161 characters, because that is
 * where one message becomes two. And the kind — promotion or announcement — is
 * the choice that decides whether the platform's own consent defaults apply, so
 * the reachable count under each channel moves when you change it. An operator
 * who picks "promotion" to 4,800 customers and sees that email will reach a
 * third of them has learned something true about the platform they are running.
 */
export function AdminNotificationCenter() {
  const t = useTranslations("admin");
  const [tab, setTab] = useState<Tab>("compose");

  const campaigns = useNotifications((s) => s.campaigns);
  const outbox = useNotifications((s) => s.outbox);
  const hydrated = useNotifications((s) => s.hydrated);

  useEffect(() => {
    useNotifications.persist.rehydrate();
  }, []);

  const TABS: { id: Tab; icon: typeof Send; count?: number }[] = [
    { id: "compose", icon: PenLine },
    { id: "campaigns", icon: History, count: campaigns.length },
    { id: "log", icon: Send, count: outbox.length },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h2 text-ink">{t("notifyTitle")}</h1>
        <p className="text-sm text-muted">{t("notifySubtitle")}</p>
      </header>

      <div role="tablist" aria-label={t("notifyTitle")} className="flex flex-wrap gap-1.5">
        {TABS.map(({ id, icon: Icon, count }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-semibold transition-colors",
              tab === id
                ? "bg-primary/10 text-primary"
                : "text-body hover:bg-surface-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(`notifyTab.${id}`)}
            {hydrated && count !== undefined && count > 0 && (
              <span className="tabular-nums opacity-70">{count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "compose" && <Composer />}
      {tab === "campaigns" && <CampaignList campaigns={hydrated ? campaigns : []} />}
      {tab === "log" && <PlatformLog rows={hydrated ? outbox : []} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

/**
 * Reach estimates, mirroring `OPT_IN_RATE` in the seam. Duplicated here on
 * purpose and clearly labelled an estimate: the composer needs a number *before*
 * the send, and the seam is where the number that counts is produced. If the two
 * ever disagree the send is right and this is stale — which is why the UI calls
 * it "estimated reach" rather than showing it as a result.
 */
const ESTIMATED_REACH: Record<DeliveryChannel, number> = {
  push: 0.21,
  email: 0.38,
  sms: 0.11,
};

function Composer() {
  const t = useTranslations("admin");
  const format = useFormatter();

  const [segments, setSegments] = useState<NotificationSegment[]>([]);
  const [segmentId, setSegmentId] = useState<SegmentId>("active-customers");
  const [kind, setKind] = useState<BroadcastKind>("promotion");
  const [channels, setChannels] = useState<DeliveryChannel[]>(["push"]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("/offers");
  const [busy, setBusy] = useState(false);

  const recordCampaign = useNotifications((s) => s.recordCampaign);

  useEffect(() => {
    getSegments().then(setSegments);
  }, []);

  const segment = segments.find((s) => s.id === segmentId) ?? null;
  const smsOver = channels.includes("sms") && body.trim().length > SMS_LIMIT;
  const titleOver = title.trim().length > TITLE_LIMIT;

  const reach = useMemo(() => {
    if (!segment) return [];
    return DELIVERY_CHANNELS.filter((c) => channels.includes(c)).map((channel) => ({
      channel,
      // An announcement is not suppressible — everyone in the segment gets it.
      people: Math.round(
        segment.size * (kind === "announcement" ? 1 : ESTIMATED_REACH[channel]),
      ),
    }));
  }, [segment, channels, kind]);

  function toggleChannel(channel: DeliveryChannel) {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((c) => c !== channel)
        : [...current, channel],
    );
  }

  function send() {
    setBusy(true);
    sendBroadcast(
      { segmentId, kind, channels, title, body, href },
      segments,
      new Date().toISOString(),
    ).then((res) => {
      setBusy(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.unknown"));
        return;
      }
      recordCampaign(res.data.campaign);
      // The campaign's own copy goes through the same gate every other
      // notification does — a promotion to a device with promotions switched
      // off lands nowhere, which is exactly what the segment maths predicted.
      if (res.data.delivered) emitNotifications([res.data.delivered]);
      setTitle("");
      setBody("");
      toast.success(
        t("notifySent", { count: campaignTotals(res.data.campaign).sent }),
      );
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-5 rounded-panel border border-line bg-surface p-5">
        {/* Segment */}
        <div>
          <label htmlFor="segment" className="text-sm font-bold text-ink">
            {t("notifySegment")}
          </label>
          <select
            id="segment"
            value={segmentId}
            onChange={(e) => setSegmentId(e.target.value as SegmentId)}
            className="mt-2 h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary"
          >
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {t(`notifySegmentName.${s.id}`)} — {format.number(s.size)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted">{t("notifySegmentHint")}</p>
        </div>

        {/* Kind */}
        <fieldset>
          <legend className="text-sm font-bold text-ink">{t("notifyKind")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(["promotion", "announcement"] as const).map((value) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-field border p-3 transition-colors",
                  kind === value
                    ? "border-primary bg-primary/5"
                    : "border-line hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={value}
                  checked={kind === value}
                  onChange={() => setKind(value)}
                  className="mt-0.5 size-4 border-line text-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">
                    {t(`notifyKindName.${value}`)}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {t(`notifyKindHint.${value}`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Channels */}
        <fieldset>
          <legend className="text-sm font-bold text-ink">{t("notifyChannels")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DELIVERY_CHANNELS.map((channel) => {
              const Icon = CHANNEL_ICON[channel];
              const on = channels.includes(channel);
              return (
                <label
                  key={channel}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-pill border px-4 py-2 text-sm font-semibold transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-line text-body hover:bg-surface-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleChannel(channel)}
                    className="sr-only"
                  />
                  <Icon className="size-4" aria-hidden />
                  {t(`notifyChannel.${channel}`)}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Message */}
        <div>
          <label htmlFor="notify-title" className="text-sm font-bold text-ink">
            {t("notifyHeadline")}
          </label>
          <input
            id="notify-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_LIMIT + 20}
            placeholder={t("notifyHeadlinePlaceholder")}
            className="mt-2 h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary"
          />
          <Counter length={title.trim().length} limit={TITLE_LIMIT} />
        </div>

        <div>
          <label htmlFor="notify-body" className="text-sm font-bold text-ink">
            {t("notifyBody")}
          </label>
          <textarea
            id="notify-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder={t("notifyBodyPlaceholder")}
            className="mt-2 w-full rounded-field border border-line bg-surface p-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary"
          />
          {channels.includes("sms") ? (
            <Counter length={body.trim().length} limit={SMS_LIMIT} note={t("notifySmsNote")} />
          ) : (
            <p className="mt-1.5 text-xs text-muted">{t("notifyBodyHint")}</p>
          )}
        </div>

        <div>
          <label htmlFor="notify-href" className="text-sm font-bold text-ink">
            {t("notifyLink")}
          </label>
          <input
            id="notify-href"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="/offers"
            className="mt-2 h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>

        <Button onClick={send} disabled={busy || smsOver || titleOver}>
          <Megaphone className="size-4" aria-hidden />
          {t("notifySend")}
        </Button>
      </section>

      {/* Reach + preview */}
      <aside className="space-y-4">
        <section className="rounded-panel border border-line bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <Users className="size-4" aria-hidden />
            {t("notifyReach")}
          </h2>
          {segment ? (
            <>
              <p className="mt-2 text-h2 tabular-nums text-ink">
                {format.number(segment.size)}
              </p>
              <p className="text-xs text-muted">{t("notifyReachHint")}</p>
              <ul className="mt-3 space-y-2">
                {reach.map(({ channel, people }) => {
                  const Icon = CHANNEL_ICON[channel];
                  return (
                    <li
                      key={channel}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="inline-flex items-center gap-2 text-body">
                        <Icon className="size-4" aria-hidden />
                        {t(`notifyChannel.${channel}`)}
                      </span>
                      <span className="font-bold tabular-nums text-ink">
                        {format.number(people)}
                      </span>
                    </li>
                  );
                })}
                {reach.length === 0 && (
                  <li className="text-sm text-muted">{t("notifyNoChannel")}</li>
                )}
              </ul>
              {kind === "promotion" && reach.length > 0 && (
                <p className="mt-3 flex gap-2 rounded-field bg-accent-50 p-2.5 text-xs text-accent-600">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden />
                  {t("notifyConsentNote")}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">{t("notifyLoading")}</p>
          )}
        </section>

        <section className="rounded-panel border border-line bg-surface p-5">
          <h2 className="text-sm font-bold text-ink">{t("notifyPreview")}</h2>
          <div className="mt-3 rounded-card border border-line bg-surface-muted p-3">
            <p className="truncate text-sm font-bold text-ink">
              {title.trim() || t("notifyPreviewTitle")}
            </p>
            <p className="mt-0.5 line-clamp-3 text-xs text-muted">
              {body.trim() || t("notifyPreviewBody")}
            </p>
          </div>
          <p className="mt-2 text-xs text-muted">{t("notifyPreviewHint")}</p>
        </section>
      </aside>
    </div>
  );
}

/** Character counter that only shouts once the limit is actually crossed. */
function Counter({
  length,
  limit,
  note,
}: {
  length: number;
  limit: number;
  note?: string;
}) {
  const over = length > limit;
  return (
    <p
      className={cn(
        "mt-1.5 flex flex-wrap items-center gap-x-2 text-xs",
        over ? "font-semibold text-danger" : "text-muted",
      )}
    >
      <span className="tabular-nums">
        {length}/{limit}
      </span>
      {note && <span>{note}</span>}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

function CampaignList({ campaigns }: { campaigns: NotificationCampaign[] }) {
  const t = useTranslations("admin");
  const format = useFormatter();

  if (campaigns.length === 0) {
    return (
      <p className="rounded-panel border border-line bg-surface p-8 text-center text-sm text-muted">
        {t("notifyNoCampaigns")}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {campaigns.map((campaign) => {
        const totals = campaignTotals(campaign);
        return (
          <li key={campaign.id} className="rounded-panel border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">{campaign.title}</p>
                <p className="mt-0.5 text-sm text-muted">{campaign.body}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-bold",
                  campaign.kind === "promotion"
                    ? "bg-primary/10 text-primary"
                    : "bg-accent-50 text-accent-600",
                )}
              >
                {t(`notifyKindName.${campaign.kind}`)}
              </span>
            </div>

            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
              <div>
                <dt className="text-muted">{t("notifySegment")}</dt>
                <dd className="font-bold text-ink">
                  {t(`notifySegmentName.${campaign.segmentId}`)} ·{" "}
                  {format.number(campaign.audienceSize)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t("notifyDelivered")}</dt>
                <dd className="font-bold tabular-nums text-fresh-600">
                  {format.number(totals.sent)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t("notifySuppressed")}</dt>
                <dd className="font-bold tabular-nums text-muted">
                  {format.number(totals.suppressed)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t("notifySentAt")}</dt>
                <dd className="font-bold text-ink">
                  {format.relativeTime(new Date(campaign.sentAt))}
                </dd>
              </div>
            </dl>

            <ul className="mt-3 flex flex-wrap gap-2">
              {campaign.results.map((result) => {
                const Icon = CHANNEL_ICON[result.channel];
                return (
                  <li
                    key={result.channel}
                    className="inline-flex items-center gap-1.5 rounded-pill bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-body"
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {t(`notifyChannel.${result.channel}`)}
                    <span className="tabular-nums text-fresh-600">
                      {format.number(result.sent)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Delivery log
// ---------------------------------------------------------------------------

/**
 * The platform-wide delivery log — which on a single-device prototype is this
 * device's outbox, and the header says so. Every row a provider integration
 * would have produced is here, including the ones consent held back.
 */
function PlatformLog({ rows }: { rows: NotificationDispatch[] }) {
  const t = useTranslations("admin");
  const tn = useTranslations("notifications");
  const format = useFormatter();
  const copy = useNotificationCopy();

  const [outbox, setOutbox] = useState<NotificationDispatch[]>([]);
  const [channel, setChannel] = useState<DeliveryChannel | null>(null);

  useEffect(() => {
    let live = true;
    getOutbox(rows, { channel, pageSize: 50 }).then((res) => {
      if (live) setOutbox(res.items);
    });
    return () => {
      live = false;
    };
  }, [rows, channel]);

  return (
    <section className="rounded-panel border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
        <div className="me-auto">
          <h2 className="text-sm font-bold text-ink">{t("notifyLogTitle")}</h2>
          <p className="mt-0.5 text-xs text-muted">{t("notifyLogHint")}</p>
        </div>
        {[null, ...DELIVERY_CHANNELS].map((value) => (
          <button
            key={value ?? "all"}
            type="button"
            aria-pressed={channel === value}
            onClick={() => setChannel(value)}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
              channel === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-line text-body hover:bg-surface-muted",
            )}
          >
            {value ? t(`notifyChannel.${value}`) : t("notifyChannelAll")}
          </button>
        ))}
      </div>

      {outbox.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted">{t("notifyLogEmpty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {outbox.map((row) => {
            const Icon = CHANNEL_ICON[row.channel];
            const { title } = copy(dispatchRenderable(row));
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-body">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {tn(`audience.${row.audience}`)} · {row.to} ·{" "}
                    {format.relativeTime(new Date(row.at))}
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-pill px-2.5 py-1 text-[11px] font-bold",
                      DISPATCH_CLASS[row.status],
                    )}
                  >
                    {tn(`dispatch.${row.status}`)}
                  </span>
                  {row.reason && (
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {tn(`reason.${row.reason}`)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
