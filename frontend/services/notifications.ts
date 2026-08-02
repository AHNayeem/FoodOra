import type {
  AppNotification,
  BroadcastInput,
  ChannelResult,
  DeliveryChannel,
  NotificationCampaign,
  NotificationDispatch,
  NotificationSegment,
  NotifyAudience,
  NotifyCategory,
  SegmentId,
} from "@/frontend/types";
import { riders, vendors } from "@/frontend/lib/mock";
import { hashSeed, mulberry32 } from "@/frontend/lib/mock/rng";
import { DELIVERY_CHANNELS, SMS_LIMIT, broadcastNotification } from "@/frontend/lib/notifications";
import { mockDelay, ok, paginate, type Paginated, type Result } from "./http";

/**
 * notifications.ts — the notification seam (Phase C25).
 *
 * The same contract as the rest of `services/`: async, `Result<T>`, error
 * strings are i18n keys the UI translates. What is unusual here is the
 * *direction* of the data: a notification feed is written by this device, so
 * the reads take the device's items as context — the `ReviewContext` pattern
 * from C22 — rather than pretending to fetch a server-owned list.
 *
 * With a Phase E backend the context parameters disappear and these become
 * ordinary queries against `notifications` / `notification_dispatches` /
 * `notification_campaigns` tables. Every signature is already shaped for that:
 * filters and paging are the seam's job here, not the component's, exactly as
 * they will be then.
 */

// ---------------------------------------------------------------------------
// Reading a feed
// ---------------------------------------------------------------------------

export interface FeedQuery {
  audience: NotifyAudience;
  /** `null` = every category. */
  category?: NotifyCategory | null;
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

/** One tab in the notification centre, with the count it would show. */
export interface CategoryFacet {
  category: NotifyCategory | null;
  total: number;
  unread: number;
}

export interface NotificationFeed {
  page: Paginated<AppNotification>;
  /** Counts for every category present, so tabs are never empty-but-shown. */
  facets: CategoryFacet[];
  unread: number;
}

/** Newest first. Ties broken by id so a re-render never reshuffles a batch. */
function byRecency(a: AppNotification, b: AppNotification): number {
  const delta = Date.parse(b.at) - Date.parse(a.at);
  return delta !== 0 ? delta : b.id.localeCompare(a.id);
}

/**
 * One audience's feed, filtered, faceted and paged.
 *
 * Facets are computed over the audience's *whole* inbox rather than the current
 * filter, because a tab that reports the count of what it would show if you
 * clicked it is the only version of that number that is useful.
 */
export async function getFeed(
  items: AppNotification[],
  query: FeedQuery,
): Promise<NotificationFeed> {
  const mine = items.filter((n) => n.audience === query.audience).sort(byRecency);

  const counts = new Map<NotifyCategory, { total: number; unread: number }>();
  for (const item of mine) {
    const entry = counts.get(item.category) ?? { total: 0, unread: 0 };
    entry.total++;
    if (!item.read) entry.unread++;
    counts.set(item.category, entry);
  }

  const unread = mine.reduce((n, item) => (item.read ? n : n + 1), 0);
  const facets: CategoryFacet[] = [
    { category: null, total: mine.length, unread },
    ...[...counts.entries()].map(([category, { total, unread: u }]) => ({
      category,
      total,
      unread: u,
    })),
  ];

  const filtered = mine.filter(
    (n) =>
      (!query.category || n.category === query.category) &&
      (!query.unreadOnly || !n.read),
  );

  return mockDelay(
    {
      page: paginate(filtered, query.page ?? 1, query.pageSize ?? 20),
      facets,
      unread,
    },
    150,
  );
}

export interface OutboxQuery {
  audience?: NotifyAudience | null;
  channel?: DeliveryChannel | null;
  page?: number;
  pageSize?: number;
}

/** The delivery log — what we sent, what we held back, and why. */
export async function getOutbox(
  dispatches: NotificationDispatch[],
  query: OutboxQuery = {},
): Promise<Paginated<NotificationDispatch>> {
  const filtered = dispatches
    .filter(
      (d) =>
        (!query.audience || d.audience === query.audience) &&
        (!query.channel || d.channel === query.channel),
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));

  return mockDelay(paginate(filtered, query.page ?? 1, query.pageSize ?? 25), 150);
}

// ---------------------------------------------------------------------------
// Segments (admin Notification Center)
// ---------------------------------------------------------------------------

/**
 * Every segment an operator can address, and how big it is.
 *
 * Two of these are counted for real — the platform's restaurants and its
 * riders are both seeded lists. The customer segments are **synthesised**: the
 * prototype has one customer account, and a composer that offered to reach
 * "1 person" would misrepresent what the screen is for. The numbers come from
 * the seeded PRNG the venue book and rider history already use, so they are
 * stable across reloads and obviously derived rather than invented per render.
 * The UI labels them as a demo population.
 */
const SEGMENT_AUDIENCE: Record<SegmentId, NotifyAudience> = {
  "all-customers": "customer",
  "active-customers": "customer",
  "lapsed-customers": "customer",
  subscribers: "customer",
  restaurants: "restaurant",
  riders: "rider",
};

function synthesise(id: SegmentId, base: number): number {
  const rand = mulberry32(hashSeed(`segment:${id}`));
  return Math.round(base * (0.85 + rand() * 0.3));
}

export async function getSegments(): Promise<NotificationSegment[]> {
  const customers = synthesise("all-customers", 4_800);
  const segments: NotificationSegment[] = [
    { id: "all-customers", audience: "customer", size: customers },
    {
      id: "active-customers",
      audience: "customer",
      size: synthesise("active-customers", customers * 0.42),
    },
    {
      id: "lapsed-customers",
      audience: "customer",
      size: synthesise("lapsed-customers", customers * 0.23),
    },
    { id: "subscribers", audience: "customer", size: synthesise("subscribers", customers * 0.09) },
    { id: "restaurants", audience: "restaurant", size: vendors.length },
    { id: "riders", audience: "rider", size: riders.length },
  ];
  return mockDelay(segments, 200);
}

// ---------------------------------------------------------------------------
// Broadcasting
// ---------------------------------------------------------------------------

/** Longest a title may be before a push notification truncates it. */
export const TITLE_LIMIT = 65;

export interface BroadcastOutcome {
  campaign: NotificationCampaign;
  /**
   * This device's own copy, when the signed-in role is in the segment. A
   * campaign to 4,800 customers reaches exactly one inbox that exists, and
   * that inbox is here.
   */
  delivered: AppNotification | null;
}

/**
 * Send a broadcast.
 *
 * The validation is the interesting part, because it is the shape a real
 * endpoint would reject on, and every rule is one an operator can hit: an empty
 * message, no channel selected, a title too long for a push banner, and an SMS
 * body over one segment. The last one is not a formality — a 161-character SMS
 * is billed as two, and a composer that lets it through without saying so is
 * how a campaign quietly doubles in cost.
 *
 * The per-channel result models a suppression rate rather than a send: the
 * platform's *own* default (C28 starts `promotions` off on every channel) means
 * most of a marketing segment is unreachable, and reporting a clean "4,800
 * sent" would misrepresent what consent-respecting delivery looks like. An
 * announcement is not suppressible and reports no shortfall.
 */
export async function sendBroadcast(
  input: BroadcastInput,
  segments: NotificationSegment[],
  at: string,
): Promise<Result<BroadcastOutcome>> {
  await mockDelay(null, 700);

  const segment = segments.find((s) => s.id === input.segmentId);
  if (!segment) return { data: null, error: "errors.unknownSegment" };
  if (input.channels.length === 0) return { data: null, error: "errors.noChannel" };
  if (input.title.trim().length === 0) return { data: null, error: "errors.emptyTitle" };
  if (input.title.trim().length > TITLE_LIMIT) return { data: null, error: "errors.longTitle" };
  if (input.body.trim().length === 0) return { data: null, error: "errors.emptyBody" };
  if (input.channels.includes("sms") && input.body.trim().length > SMS_LIMIT) {
    return { data: null, error: "errors.longSms" };
  }

  const category: NotifyCategory = input.kind === "promotion" ? "promo" : "system";
  const rand = mulberry32(hashSeed(`${input.segmentId}:${input.title}`));

  const results: ChannelResult[] = DELIVERY_CHANNELS.filter((c) =>
    input.channels.includes(c),
  ).map((channel) => {
    // Announcements go to everyone; promotions only reach the opted-in.
    const optInRate = input.kind === "announcement" ? 1 : OPT_IN_RATE[channel] * (0.9 + rand() * 0.2);
    const sent = Math.round(segment.size * Math.min(optInRate, 1));
    return { channel, sent, suppressed: segment.size - sent };
  });

  const campaign: NotificationCampaign = {
    id: `cmp_${hashSeed(`${at}:${input.title}`).toString(36)}`,
    segmentId: input.segmentId,
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim(),
    href: input.href.trim() || "/offers",
    audienceSize: segment.size,
    results,
    sentAt: at,
  };

  return ok({
    campaign,
    delivered: broadcastNotification({
      campaignId: campaign.id,
      audience: SEGMENT_AUDIENCE[input.segmentId],
      category,
      title: campaign.title,
      body: campaign.body,
      href: campaign.href,
      at,
    }),
  });
}

/**
 * How much of a segment a marketing message actually reaches, per channel.
 * Push is lowest because it needs an OS-level grant on top of the preference;
 * email is highest because it needs neither.
 */
const OPT_IN_RATE: Record<DeliveryChannel, number> = {
  push: 0.21,
  email: 0.38,
  sms: 0.11,
};

/** Roll a campaign's per-channel counts up into one headline pair. */
export function campaignTotals(campaign: NotificationCampaign): {
  sent: number;
  suppressed: number;
} {
  return campaign.results.reduce(
    (acc, r) => ({ sent: acc.sent + r.sent, suppressed: acc.suppressed + r.suppressed }),
    { sent: 0, suppressed: 0 },
  );
}
