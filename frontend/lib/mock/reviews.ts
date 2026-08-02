import type { Review, ReviewAspects, ReviewMedia, ReviewTag, StarValue } from "@/types";
import {
  NEGATIVE_TAGS,
  POSITIVE_TAGS,
  distributionFromAggregate,
  toStar,
} from "@/lib/reviews";
import { foodsByVendor } from "./foods";
import { hashSeed, mulberry32, pick } from "./rng";
import { riderById } from "./riders";
import { vendorById } from "./vendors";

/**
 * reviews.ts — the review corpus behind every rating in the prototype (C22).
 *
 * A vendor carries `rating` and `reviewCount` in the catalogue — Bella Napoli
 * has 1,284 reviews — and no seed file is going to ship 1,284 rows, let alone
 * the 20,000 across the directory. So this synthesises a *page* of them on
 * request, the way `buildVendorOrders` (C10), `buildVendorReservations` (C16)
 * and `buildRiderHistory` (C18) synthesise theirs: a deterministic PRNG seeded
 * from the id, anchored to a `now` the caller passes in, so the same restaurant
 * always shows the same reviews and a reload never reshuffles them.
 *
 * The one rule that makes the sample honest: **the stars are drawn from the
 * catalogue's own aggregate.** `distributionFromAggregate` turns the stored
 * (rating, count) into a histogram, and the sample takes its stars from that
 * histogram scaled down — so a 4.9-star sushi bar reads like one and a 4.4-star
 * bakery reads like one, and the page of reviews can never contradict the number
 * printed above it. Everything else (who wrote it, when, what they said, whether
 * the restaurant answered) hangs off the star that was drawn.
 *
 * Comments are DATA, not copy — real people write reviews in their own words, so
 * they are English strings on the entity and are never translated, exactly like
 * vendor taglines (C4) and testimonial quotes (C1). Only the tag vocabulary is
 * keys, because tags are counted and filtered as well as displayed.
 */

const DAY = 86_400_000;

/** How many reviews a vendor's first pages hold. */
const SAMPLE_MIN = 18;
const SAMPLE_SPREAD = 10;

/** How far back a synthesised corpus reaches. */
const HISTORY_DAYS = 210;

interface Author {
  id: string;
  name: string;
  avatar: string | null;
}

/**
 * The reviewer pool. Dhaka-weighted like the rest of the seed, with a few
 * avatarless entries — a real corpus is not uniformly photogenic, and the card
 * has to render initials as well as an image.
 */
const AUTHORS: Author[] = [
  { id: "usr_rv_01", name: "Ayesha Rahman", avatar: "https://i.pravatar.cc/120?img=45" },
  { id: "usr_rv_02", name: "Imran Chowdhury", avatar: "https://i.pravatar.cc/120?img=12" },
  { id: "usr_rv_03", name: "Nabila Karim", avatar: "https://i.pravatar.cc/120?img=32" },
  { id: "usr_rv_04", name: "Farhan Ahmed", avatar: null },
  { id: "usr_rv_05", name: "Sadia Islam", avatar: "https://i.pravatar.cc/120?img=47" },
  { id: "usr_rv_06", name: "Rafiq Uddin", avatar: "https://i.pravatar.cc/120?img=59" },
  { id: "usr_rv_07", name: "Tasnim Haque", avatar: "https://i.pravatar.cc/120?img=26" },
  { id: "usr_rv_08", name: "Zayan Malik", avatar: null },
  { id: "usr_rv_09", name: "Mitu Akter", avatar: "https://i.pravatar.cc/120?img=41" },
  { id: "usr_rv_10", name: "Shakib Alam", avatar: "https://i.pravatar.cc/120?img=15" },
  { id: "usr_rv_11", name: "Rima Sultana", avatar: "https://i.pravatar.cc/120?img=36" },
  { id: "usr_rv_12", name: "Arif Hasan", avatar: "https://i.pravatar.cc/120?img=68" },
  { id: "usr_rv_13", name: "Nusaiba Noor", avatar: "https://i.pravatar.cc/120?img=44" },
  { id: "usr_rv_14", name: "Hasib Rahman", avatar: null },
  { id: "usr_rv_15", name: "Lamia Chowdhury", avatar: "https://i.pravatar.cc/120?img=20" },
  { id: "usr_rv_16", name: "Omar Faruk", avatar: "https://i.pravatar.cc/120?img=53" },
  { id: "usr_rv_17", name: "Priya Das", avatar: "https://i.pravatar.cc/120?img=49" },
  { id: "usr_rv_18", name: "Kamrul Hasan", avatar: "https://i.pravatar.cc/120?img=8" },
];

/**
 * What people write, by star. `{dish}` and `{vendor}` are filled from the real
 * catalogue, which is what stops a synthesised corpus reading as filler: a
 * review that names the Margherita is about *this* restaurant.
 */
const COMMENTS: Record<StarValue, string[]> = {
  5: [
    "The {dish} was genuinely the best I've had in Dhaka. Arrived hot, packed properly, not a drop spilled.",
    "Third order from {vendor} this month and it has been perfect every single time. The {dish} is the reason.",
    "Ordered late and still got everything fresh. The {dish} travels really well — no sogginess at all.",
    "Portions are generous, flavours are spot on, and the rider called ahead. Nothing to fault.",
    "{vendor} has become our Friday routine. The kids demolished the {dish} before I got a bite.",
    "Worth every taka. You can taste that the {dish} is made to order rather than sitting under a lamp.",
    "Packaging deserves a mention — everything sealed, sauces separate, still steaming when it reached the sixth floor.",
    "Booked it for a small get-together and everyone asked where it was from. The {dish} disappeared first.",
  ],
  4: [
    "Really good food, and the {dish} in particular. Took a little longer than the estimate but worth waiting for.",
    "Solid every time. Would be five stars if the delivery fee was a bit kinder on smaller orders.",
    "The {dish} was excellent. Sides were fine but nothing special — I'd order the mains again on their own.",
    "Tasty and generously portioned. Arrived slightly warm rather than hot, which is the only reason it isn't a five.",
    "Consistent quality from {vendor}. Ordered for the office and everyone was happy with their pick.",
    "Great flavours, well packed. A little heavy on the oil for my taste but I'd still reorder.",
  ],
  3: [
    "Decent, not memorable. The {dish} was fine but I've had better at this price.",
    "Food was okay — the rider was quick, but one item arrived lukewarm.",
    "Mixed order. The {dish} was lovely, the rest was average. Might stick to just that next time.",
    "Fine for a weeknight. Portions felt smaller than the photos suggest.",
    "Nothing wrong with it, nothing that made me want to order again straight away.",
  ],
  2: [
    "Arrived nearly an hour after the estimate and by then the {dish} was cold.",
    "Missing one item and no one picked up when I called the restaurant. Food that did arrive was okay.",
    "Under-seasoned and a bit dry. Not what the reviews had me expecting.",
    "Packaging leaked all over the bag. The food was salvageable, the evening less so.",
  ],
  1: [
    "Order arrived completely wrong and an hour late. Had to cook something in the end.",
    "Inedible — the {dish} tasted like it had been reheated more than once. Asked for a refund.",
    "Never turned up. The tracker said delivered. Deeply frustrating.",
  ],
};

/** How a restaurant answers. Tone follows the star it is answering. */
const REPLIES: Record<"good" | "mixed" | "bad", string[]> = {
  good: [
    "Thank you {name}! Delighted this landed well — see you again soon.",
    "This made our kitchen's day, {name}. Thanks for taking the time to write it.",
    "Thanks {name}! We'll pass this on to the chefs — they'll be very pleased.",
  ],
  mixed: [
    "Thanks for the honest note, {name}. We're tightening up packing this week — hope the next one is a five.",
    "Appreciate the feedback {name}. We've flagged the timing with our dispatch team.",
    "Thank you {name}. Portion sizes are under review — your comment helps make that case.",
  ],
  bad: [
    "We're sorry, {name}. This isn't our standard — please reach out through support and we'll make it right.",
    "Genuinely sorry to read this, {name}. The order has been raised with the kitchen manager today.",
    "Apologies {name}. We'd like to fix this — support has been asked to contact you about a refund.",
  ],
};

/** Customer photos attached to reviews. Reused across vendors, as a real feed does. */
const PHOTOS = [
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=600&q=80",
];

/** What riders get told, by band. Shorter — a courier review is a sentence. */
const RIDER_COMMENTS: Record<"good" | "mixed" | "bad", string[]> = {
  good: [
    "Called ahead, found the flat first time, food still hot. Faultless.",
    "Polite and quick even in the rain. Thank you!",
    "Waited patiently while I came down. Really pleasant to deal with.",
    "Handed everything over neatly and checked the bag was complete.",
  ],
  mixed: [
    "Got here fine but took a couple of calls to find the building.",
    "Fine delivery, though the bag was tilted on the way up.",
  ],
  bad: [
    "Left the order at the gate without calling.",
    "Very late and no update on the way.",
  ],
};

/** Turn a draw into a whole star, given a histogram of how many of each to hand out. */
function drawStars(dist: Record<StarValue, number>, rand: () => number): StarValue[] {
  const pool: StarValue[] = [];
  for (const star of [5, 4, 3, 2, 1] as StarValue[]) {
    for (let i = 0; i < dist[star]; i++) pool.push(star);
  }
  // Fisher-Yates with the seeded generator: the *mix* is fixed by the aggregate,
  // only the order in which reviews were written is randomised.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/** Sub-scores that sit around the overall star rather than repeating it. */
function aspectsFor(star: StarValue, rand: () => number, delivery: boolean): ReviewAspects {
  const jitter = () => Math.min(5, Math.max(1, star + (rand() < 0.3 ? (rand() < 0.5 ? -1 : 1) : 0)));
  const aspects: ReviewAspects = { food: jitter(), packaging: jitter(), value: jitter() };
  // A pickup order has nothing to say about delivery — leaving the key off is
  // the honest answer, and `aspectAverages` skips it rather than scoring a zero.
  if (delivery) aspects.delivery = jitter();
  return aspects;
}

/** Two or three tags that agree with the star. */
function tagsFor(star: StarValue, rand: () => number): ReviewTag[] {
  const pool = star >= 4 ? POSITIVE_TAGS : star <= 2 ? NEGATIVE_TAGS : [...POSITIVE_TAGS.slice(0, 3), ...NEGATIVE_TAGS.slice(0, 3)];
  const wanted = 1 + Math.floor(rand() * 2);
  const chosen: ReviewTag[] = [];
  while (chosen.length < wanted) {
    const tag = pick(pool, rand);
    if (!chosen.includes(tag)) chosen.push(tag);
  }
  return chosen;
}

/** Fill `{dish}` / `{vendor}` from the catalogue so the text is about this place. */
function fillTemplate(template: string, vendorName: string, dishName: string): string {
  return template.replaceAll("{vendor}", vendorName).replaceAll("{dish}", dishName);
}

function bandFor(star: StarValue): "good" | "mixed" | "bad" {
  return star >= 4 ? "good" : star === 3 ? "mixed" : "bad";
}

/** The order reference a review points back at, derived like `services/orders` does. */
function orderNumberFrom(ms: number): string {
  return `FO-${ms.toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

/**
 * A restaurant's reviews, newest first.
 *
 * `now` anchors the timestamps so the newest review is always days rather than
 * years old; the seed file itself never reads the clock (module evaluation stays
 * deterministic, the C10 rule).
 */
export function buildVendorReviews(vendorId: string, now: number): Review[] {
  const vendor = vendorById.get(vendorId);
  if (!vendor) return [];

  const rand = mulberry32(hashSeed(`reviews:${vendorId}`));
  const size = SAMPLE_MIN + Math.floor(rand() * SAMPLE_SPREAD);
  const stars = drawStars(distributionFromAggregate(vendor.rating, size), rand);
  const dishes = foodsByVendor[vendorId] ?? [];

  return stars.map((star, index) => {
    const author = AUTHORS[(hashSeed(`${vendorId}:${index}`) + index) % AUTHORS.length];
    const dish = dishes.length > 0 ? dishes[Math.floor(rand() * dishes.length)] : null;
    const band = bandFor(star);
    // Newest first: review 0 is a day or two old, the last reaches back months.
    // Squaring the position clusters reviews towards the present, which is what
    // a growing restaurant's feed looks like.
    const age = ((index + 0.5) / stars.length) ** 1.6 * HISTORY_DAYS;
    const at = now - age * DAY - Math.floor(rand() * DAY);
    const isDelivery = rand() > 0.2;

    const media: ReviewMedia[] =
      star >= 4 && rand() < 0.35
        ? [
            {
              id: `rvm_${vendorId}_${index}`,
              kind: "photo",
              url: PHOTOS[index % PHOTOS.length],
              thumbnail: PHOTOS[index % PHOTOS.length],
            },
          ]
        : [];

    // Restaurants answer their unhappy customers first — a low review is far
    // more likely to have a reply than a glowing one, as on any real platform.
    const replyChance = star <= 2 ? 0.85 : star === 3 ? 0.6 : 0.3;
    const repliedAt = at + (4 + rand() * 20) * 3_600_000;
    const reply =
      rand() < replyChance && repliedAt < now
        ? {
            body: pick(REPLIES[band], rand).replaceAll("{name}", author.name.split(" ")[0]),
            authorName: vendor.name,
            repliedAt: new Date(repliedAt).toISOString(),
          }
        : null;

    const iso = new Date(at).toISOString();
    return {
      id: `rev_${vendorId}_${index}`,
      subject: "vendor" as const,
      subjectId: vendorId,
      vendorId,
      orderId: `ord_seed_${vendorId}_${index}`,
      orderNumber: orderNumberFrom(at),
      authorId: author.id,
      authorName: author.name,
      authorAvatar: author.avatar,
      rating: star,
      aspects: aspectsFor(star, rand, isDelivery),
      comment: fillTemplate(pick(COMMENTS[star], rand), vendor.name, dish?.name ?? "food"),
      tags: tagsFor(star, rand),
      dishIds: dish ? [dish.id] : [],
      media,
      helpfulCount: Math.floor(rand() * (star >= 4 ? 24 : 9)),
      reply,
      verified: rand() > 0.12,
      createdAt: iso,
      updatedAt: reply?.repliedAt ?? iso,
      deletedAt: null,
    } satisfies Review;
  });
}

/**
 * A courier's recent feedback. Riders are rated on the same form as the
 * restaurant — one order, two subjects — so these are `Review` rows with
 * `subject: "rider"`, which is why the rider app can render them with the same
 * card the storefront uses.
 */
export function buildRiderReviews(riderId: string, now: number): Review[] {
  const rider = riderById.get(riderId);
  if (!rider) return [];

  const rand = mulberry32(hashSeed(`rider-reviews:${riderId}`));
  const size = 8 + Math.floor(rand() * 5);
  const stars = drawStars(distributionFromAggregate(rider.rating, size), rand);

  return stars.map((star, index) => {
    const author = AUTHORS[(hashSeed(`${riderId}:${index}`) + index * 3) % AUTHORS.length];
    const at = now - (((index + 0.5) / stars.length) ** 1.4 * 60 + rand()) * DAY;
    const iso = new Date(at).toISOString();
    return {
      id: `rev_${riderId}_${index}`,
      subject: "rider" as const,
      subjectId: riderId,
      // A courier review belongs to the trip's restaurant commercially, but the
      // synthesised pool has no single vendor behind it — the rider's own zone
      // stands in, and the merchant board filters on `subject` anyway.
      vendorId: "",
      orderId: `ord_seed_${riderId}_${index}`,
      orderNumber: orderNumberFrom(at),
      authorId: author.id,
      authorName: author.name,
      authorAvatar: author.avatar,
      rating: star,
      aspects: { delivery: toStar(star) },
      comment: pick(RIDER_COMMENTS[bandFor(star)], rand),
      tags: star >= 4 ? (["fast-delivery", "friendly-rider"] as ReviewTag[]) : (["late"] as ReviewTag[]),
      dishIds: [],
      media: [],
      helpfulCount: 0,
      reply: null,
      verified: true,
      createdAt: iso,
      updatedAt: iso,
      deletedAt: null,
    } satisfies Review;
  });
}

/** The stock photos the write form offers as "attach a photo" (no camera in a prototype). */
export const SAMPLE_REVIEW_PHOTOS = PHOTOS;
