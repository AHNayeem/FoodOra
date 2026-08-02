/**
 * cms.ts — the content store's seed (Phase C26).
 *
 * Two rules shaped this file:
 *
 * 1. **No prose is written twice.** Every document is *derived* from the seed
 *    the site already renders — `pages.ts`, `posts.ts`, `categories.ts`,
 *    `constants/navigation.ts` — so the CMS edits the same content the pages
 *    show rather than a parallel copy that could disagree with it. The only new
 *    prose here is content that did not exist before the phase: the contact
 *    page, the refund policy, the promotional banners and the SEO records.
 *
 * 2. **Chrome keeps its translation.** Copy that lives in the message catalogs
 *    (the landing hero, the nav labels, the page eyebrows) is seeded as a
 *    *fallback key* rather than as text, so all three locales stay correct until
 *    an editor deliberately overrides one. See `resolveText` in `lib/cms.ts`.
 *
 * Windows are stored as **day offsets from `now`** and stamped by
 * `buildCmsDocuments(now)` — the C20 `buildOffers` pattern — so the scheduled
 * banner is always genuinely in the future and the seed never reads the clock.
 */
import type {
  CmsCollectionDef,
  CmsDocument,
  CmsFieldDef,
  CmsLocalizedText,
  CmsRow,
  CmsScalar,
  CmsValues,
  DocSection,
  FaqGroup,
  HowStep,
  JobOpening,
  StatItem,
  SupportChannel,
  TimelineEntry,
  ValueProp,
} from "@/types";
import { footerNav, primaryNav } from "@/constants/navigation";
import { SEED_NOW } from "./cuisines";
import { categories } from "./categories";
import { posts } from "./posts";
import {
  aboutStats,
  aboutStory,
  aboutTimeline,
  aboutValues,
  aboutMission,
  careersIntro,
  careersPerks,
  helpChannels,
  helpFaqs,
  jobOpenings,
  legalDocs,
  partnerFaqs,
  partnerIntro,
  partnerStats,
  partnerSteps,
  partnerValues,
  riderFaqs,
  riderIntro,
  riderStats,
  riderSteps,
  riderValues,
} from "./pages";

const DAY = 24 * 60 * 60 * 1000;

/** English is the authoring locale; bn/ar fall back until someone translates. */
function loc(en: string): CmsLocalizedText {
  return { en };
}

function row(id: string, values: Record<string, CmsScalar | CmsLocalizedText>): CmsRow {
  return { id, values };
}

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

const ICON_HELP = "Lucide icon name — see the allow-list in components/directory/dash-icon.";

const bannerFields: CmsFieldDef[] = [
  {
    key: "placement",
    label: "Placement",
    type: "select",
    required: true,
    help: "Which slot on the site renders it.",
    options: [
      { value: "home-hero", label: "Landing hero" },
      { value: "home-strip", label: "Landing promo strip" },
      { value: "offers-top", label: "Top of the offers page" },
    ],
  },
  { key: "eyebrow", label: "Eyebrow", type: "text", localized: true, max: 40 },
  { key: "title", label: "Headline", type: "text", localized: true, required: true, max: 90 },
  { key: "subtitle", label: "Sub-headline", type: "textarea", localized: true, rows: 2, max: 240 },
  {
    key: "searchPlaceholder",
    label: "Address placeholder",
    type: "text",
    localized: true,
    max: 60,
    help: "Hero only — the placeholder inside the address field.",
  },
  { key: "ctaLabel", label: "Button label", type: "text", localized: true, max: 40 },
  { key: "ctaHref", label: "Button link", type: "url" },
  { key: "icon", label: "Icon", type: "icon", help: ICON_HELP },
  {
    key: "tone",
    label: "Tone",
    type: "select",
    options: [
      { value: "primary", label: "Primary" },
      { value: "ink", label: "Ink" },
      { value: "accent", label: "Accent" },
    ],
  },
];

const pageFields: CmsFieldDef[] = [
  { key: "eyebrow", label: "Eyebrow", type: "text", localized: true, max: 40 },
  { key: "title", label: "Heading", type: "text", localized: true, required: true, max: 90 },
  { key: "lead", label: "Lead paragraph", type: "textarea", localized: true, rows: 3, max: 400 },
];

const valuePropFields: CmsFieldDef[] = [
  { key: "icon", label: "Icon", type: "icon", help: ICON_HELP },
  { key: "title", label: "Title", type: "text", localized: true, required: true },
  { key: "description", label: "Body", type: "textarea", localized: true, rows: 3 },
];

const statFields: CmsFieldDef[] = [
  { key: "value", label: "Figure", type: "text", required: true, help: "Shown as written, e.g. 12,400+." },
  { key: "label", label: "Label", type: "text", localized: true, required: true },
];

const channelFields: CmsFieldDef[] = [
  { key: "icon", label: "Icon", type: "icon", help: ICON_HELP },
  { key: "title", label: "Title", type: "text", localized: true, required: true },
  { key: "description", label: "Body", type: "textarea", localized: true, rows: 2 },
  { key: "actionLabel", label: "Action label", type: "text", localized: true },
  { key: "href", label: "Action link", type: "url" },
  { key: "availability", label: "Availability", type: "text", localized: true },
];

const legalFields: CmsFieldDef[] = [
  { key: "title", label: "Document title", type: "text", localized: true, required: true },
  { key: "intro", label: "Introduction", type: "textarea", localized: true, rows: 4 },
  { key: "effectiveFrom", label: "Effective from", type: "date", required: true },
  {
    key: "sections",
    label: "Sections",
    type: "repeater",
    required: true,
    max: 24,
    fields: [
      { key: "id", label: "Anchor", type: "text", required: true, help: "Used by the on-page contents list." },
      { key: "heading", label: "Heading", type: "text", localized: true, required: true },
      {
        key: "body",
        label: "Body",
        type: "textarea",
        localized: true,
        rows: 6,
        help: "A blank line starts a new paragraph.",
      },
      { key: "bullets", label: "Bullets", type: "textarea", localized: true, rows: 3, help: "One per line." },
    ],
  },
];

const postFields: CmsFieldDef[] = [
  { key: "slug", label: "Slug", type: "text", required: true, help: "The article's URL under /blog." },
  { key: "title", label: "Title", type: "text", localized: true, required: true, max: 120 },
  { key: "excerpt", label: "Excerpt", type: "textarea", localized: true, rows: 3, max: 320 },
  { key: "cover", label: "Cover image", type: "image" },
  { key: "category", label: "Category", type: "text", required: true },
  { key: "author", label: "Author", type: "text", required: true },
  { key: "authorRole", label: "Author role", type: "text", localized: true },
  { key: "authorAvatar", label: "Author avatar", type: "image" },
  { key: "readMinutes", label: "Read time (min)", type: "number" },
  { key: "publishedAt", label: "Published on", type: "date", required: true },
  { key: "tags", label: "Tags", type: "list", help: "One per line — used for the related-posts rail." },
  {
    key: "body",
    label: "Article",
    type: "repeater",
    required: true,
    max: 60,
    fields: [
      {
        key: "type",
        label: "Block",
        type: "select",
        required: true,
        options: [
          { value: "paragraph", label: "Paragraph" },
          { value: "heading", label: "Heading" },
          { value: "list", label: "Bullet list" },
          { value: "quote", label: "Quote" },
        ],
      },
      { key: "text", label: "Text", type: "textarea", localized: true, rows: 5, required: true },
      { key: "cite", label: "Attribution", type: "text", help: "Quote blocks only." },
    ],
  },
];

const faqFields: CmsFieldDef[] = [
  {
    key: "surface",
    label: "Shown on",
    type: "select",
    required: true,
    options: [
      { value: "help", label: "Help centre" },
      { value: "partner", label: "Partner page" },
      { value: "rider", label: "Rider page" },
    ],
  },
  { key: "title", label: "Group title", type: "text", localized: true, required: true },
  { key: "icon", label: "Icon", type: "icon", help: ICON_HELP },
  {
    key: "items",
    label: "Questions",
    type: "repeater",
    required: true,
    max: 24,
    fields: [
      { key: "question", label: "Question", type: "text", localized: true, required: true },
      { key: "answer", label: "Answer", type: "textarea", localized: true, rows: 4, required: true },
    ],
  },
];

const categoryFields: CmsFieldDef[] = [
  { key: "slug", label: "Slug", type: "text", required: true, help: "Becomes /search?category=<slug>." },
  { key: "name", label: "Name", type: "text", localized: true, required: true },
  { key: "emoji", label: "Emoji", type: "emoji" },
  { key: "image", label: "Image", type: "image" },
  {
    key: "keywords",
    label: "Search keywords",
    type: "list",
    help: "One per line — what the tile actually searches for.",
  },
];

const menuFields: CmsFieldDef[] = [
  { key: "name", label: "Menu", type: "text", required: true },
  {
    key: "items",
    label: "Links",
    type: "repeater",
    required: true,
    max: 24,
    fields: [
      { key: "label", label: "Label", type: "text", localized: true, help: "Overrides the translation key." },
      { key: "labelKey", label: "Message key", type: "text", help: "Used when no label is authored." },
      { key: "href", label: "Link", type: "url", required: true },
      { key: "icon", label: "Icon", type: "icon", help: ICON_HELP },
      {
        key: "group",
        label: "Group",
        type: "select",
        options: [
          { value: "discover", label: "Discover" },
          { value: "services", label: "Services" },
          { value: "company", label: "Company" },
          { value: "legal", label: "Legal" },
          { value: "business", label: "For business" },
        ],
      },
      { key: "visible", label: "Visible", type: "boolean" },
    ],
  },
];

const seoFields: CmsFieldDef[] = [
  { key: "route", label: "Route", type: "text", required: true },
  { key: "metaTitle", label: "Title tag", type: "text", localized: true, max: 70 },
  {
    key: "metaDescription",
    label: "Meta description",
    type: "textarea",
    localized: true,
    rows: 3,
    max: 200,
  },
  { key: "ogImage", label: "Share image", type: "image" },
  { key: "noindex", label: "Hide from search engines", type: "boolean" },
];

const siteFields: CmsFieldDef[] = [
  { key: "brandName", label: "Brand name", type: "text", required: true },
  { key: "tagline", label: "Tagline", type: "text", localized: true },
  { key: "description", label: "Description", type: "textarea", localized: true, rows: 3 },
  { key: "supportEmail", label: "Support email", type: "text" },
  { key: "supportPhone", label: "Support phone", type: "text" },
  { key: "address", label: "Registered address", type: "text", localized: true },
  { key: "twitter", label: "X / Twitter", type: "url" },
  { key: "instagram", label: "Instagram", type: "url" },
  { key: "facebook", label: "Facebook", type: "url" },
  { key: "footerNote", label: "Footer note", type: "text", localized: true },
];

/** The collections the admin lists, in the order it lists them. */
export const cmsCollections: CmsCollectionDef[] = [
  {
    id: "banners",
    label: "Banners & promotions",
    description: "The landing hero and every promotional strip, with their own publication windows.",
    icon: "Flame",
    surface: "Landing page, offers page",
    previewHref: "/",
    fields: bannerFields,
    titleField: "title",
    creatable: true,
    orderable: true,
  },
  {
    id: "pages",
    label: "Pages",
    description: "About, careers, help, contact and the two acquisition pages.",
    icon: "FileText",
    surface: "/about, /careers, /help, /contact, /partner, /rider",
    fields: pageFields,
    titleField: "title",
  },
  {
    id: "legal",
    label: "Legal documents",
    description: "Terms, privacy and the refund policy — sectioned, with an effective date.",
    icon: "ShieldCheck",
    surface: "/terms, /privacy, /refund",
    fields: legalFields,
    titleField: "title",
    creatable: true,
  },
  {
    id: "posts",
    label: "Blog",
    description: "Articles, their structured bodies and the tags the related rail matches on.",
    icon: "Newspaper",
    surface: "/blog",
    previewHref: "/blog",
    fields: postFields,
    titleField: "title",
    creatable: true,
  },
  {
    id: "faqs",
    label: "FAQs",
    description: "Question groups, each pinned to the page that shows it.",
    icon: "MessageCircle",
    surface: "/help, /partner, /rider",
    previewHref: "/help",
    fields: faqFields,
    titleField: "title",
    creatable: true,
    orderable: true,
  },
  {
    id: "categories",
    label: "Categories",
    description: "The craving rail on the landing page — and the search each tile runs.",
    icon: "Utensils",
    surface: "Landing page",
    previewHref: "/",
    fields: categoryFields,
    titleField: "name",
    creatable: true,
    orderable: true,
  },
  {
    id: "menus",
    label: "Navigation",
    description: "Header and footer links, their order and their groups.",
    icon: "Menu",
    surface: "Every public page",
    fields: menuFields,
    titleField: "name",
    orderable: true,
  },
  {
    id: "seo",
    label: "SEO metadata",
    description: "Title tags, descriptions and share images, per route.",
    icon: "Search",
    surface: "Document head",
    fields: seoFields,
    titleField: "route",
    creatable: true,
  },
  {
    id: "site",
    label: "Site settings",
    description: "Brand, tagline, support contacts and social links.",
    icon: "Store",
    surface: "Footer, contact page, metadata",
    fields: siteFields,
    titleField: "brandName",
  },
];

export const cmsCollectionById = new Map(cmsCollections.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// Row builders — the existing seed, as repeater rows
// ---------------------------------------------------------------------------

function propRows(items: ValueProp[], prefix = "v"): CmsRow[] {
  return items.map((item, i) =>
    row(`${prefix}${i + 1}`, {
      icon: item.icon,
      title: loc(item.title),
      description: loc(item.description),
    }),
  );
}

function stepRows(items: HowStep[]): CmsRow[] {
  return propRows(items as ValueProp[], "s");
}

function statRows(items: StatItem[]): CmsRow[] {
  return items.map((item, i) => row(`n${i + 1}`, { value: item.value, label: loc(item.label) }));
}

function timelineRows(items: TimelineEntry[]): CmsRow[] {
  return items.map((item, i) =>
    row(`t${i + 1}`, { year: item.year, title: loc(item.title), description: loc(item.description) }),
  );
}

function channelRows(items: SupportChannel[]): CmsRow[] {
  return items.map((item, i) =>
    row(`c${i + 1}`, {
      icon: item.icon,
      title: loc(item.title),
      description: loc(item.description),
      actionLabel: loc(item.actionLabel),
      href: item.href,
      availability: loc(item.availability),
    }),
  );
}

function jobRows(items: JobOpening[]): CmsRow[] {
  return items.map((job) =>
    row(job.id.replace(/^job_/, ""), {
      slug: job.slug,
      title: loc(job.title),
      team: loc(job.team),
      location: loc(job.location),
      employment: loc(job.employment),
      workplace: loc(job.workplace),
      summary: loc(job.summary),
    }),
  );
}

function sectionRows(sections: DocSection[]): CmsRow[] {
  return sections.map((section, i) =>
    row(`sec${i + 1}`, {
      id: section.id,
      heading: loc(section.heading),
      body: loc(section.paragraphs.join("\n\n")),
      bullets: loc((section.bullets ?? []).join("\n")),
    }),
  );
}

const jobFields: CmsFieldDef[] = [
  { key: "slug", label: "Slug", type: "text", required: true },
  { key: "title", label: "Role", type: "text", localized: true, required: true },
  { key: "team", label: "Team", type: "text", localized: true, required: true },
  { key: "location", label: "Location", type: "text", localized: true },
  { key: "employment", label: "Contract", type: "text", localized: true },
  { key: "workplace", label: "Workplace", type: "text", localized: true },
  { key: "summary", label: "Summary", type: "textarea", localized: true, rows: 3 },
];

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

interface DocSeed {
  collection: CmsDocument["collection"];
  key: string;
  values: CmsValues;
  sort?: number;
  locked?: boolean;
  fields?: CmsFieldDef[];
  fallbacks?: Record<string, string>;
  /** Publication window, in days from `now`. */
  publishInDays?: number;
  unpublishInDays?: number;
}

function makeDoc(seed: DocSeed, now: number): CmsDocument {
  const stamp = (days?: number) => (days === undefined ? null : new Date(now + days * DAY).toISOString());
  return {
    id: `cms_${seed.collection}_${seed.key}`,
    collection: seed.collection,
    key: seed.key,
    createdAt: SEED_NOW,
    updatedAt: SEED_NOW,
    deletedAt: null,
    values: seed.values,
    draft: null,
    sort: seed.sort ?? 1,
    publishAt: stamp(seed.publishInDays),
    unpublishAt: stamp(seed.unpublishInDays),
    publishedAt: SEED_NOW,
    archivedAt: null,
    updatedBy: "Seed",
    locked: seed.locked,
    fields: seed.fields,
    fallbacks: seed.fallbacks,
  };
}

/** Every seeded document, with windows stamped against `now`. */
export function buildCmsDocuments(now: number): CmsDocument[] {
  const seeds: DocSeed[] = [];

  // ── Banners ──────────────────────────────────────────────────────────────
  seeds.push({
    collection: "banners",
    key: "home-hero",
    sort: 1,
    locked: true,
    values: { placement: "home-hero", ctaHref: "/search", icon: "Sparkles", tone: "primary" },
    // The hero's copy lives in the catalogs today; the CMS takes it over without
    // copying a single translated string.
    fallbacks: {
      title: "home.heroTitle",
      subtitle: "home.heroSubtitle",
      searchPlaceholder: "home.searchPlaceholder",
      ctaLabel: "home.findFood",
    },
  });

  seeds.push({
    collection: "banners",
    key: "home-free-delivery",
    sort: 2,
    publishInDays: -3,
    unpublishInDays: 11,
    values: {
      placement: "home-strip",
      eyebrow: loc("This week"),
      title: loc("Free delivery on your first three orders"),
      subtitle: loc("New here? We cover the rider on your first three deliveries — no code, no minimum."),
      ctaLabel: loc("See the offers"),
      ctaHref: "/offers",
      icon: "Percent",
      tone: "primary",
    },
  });

  seeds.push({
    collection: "banners",
    key: "home-meal-plans",
    sort: 3,
    values: {
      placement: "home-strip",
      eyebrow: loc("Eat on a plan"),
      title: loc("A week of lunches, decided once"),
      subtitle: loc("Subscription meals from kitchens that cook to a rotating menu. Skip a day whenever you like."),
      ctaLabel: loc("Browse meal plans"),
      ctaHref: "/meal-plans",
      icon: "Salad",
      tone: "ink",
    },
  });

  // Genuinely scheduled: the site will not render it, and the admin says why.
  seeds.push({
    collection: "banners",
    key: "home-festival",
    sort: 4,
    publishInDays: 21,
    unpublishInDays: 35,
    values: {
      placement: "home-strip",
      eyebrow: loc("Coming soon"),
      title: loc("Festival menus, opening in three weeks"),
      subtitle: loc("Pre-order platters from thirty kitchens. This strip publishes itself on the day."),
      ctaLabel: loc("See caterers"),
      ctaHref: "/catering",
      icon: "PartyPopper",
      tone: "accent",
    },
  });

  seeds.push({
    collection: "banners",
    key: "offers-flash",
    sort: 5,
    values: {
      placement: "offers-top",
      eyebrow: loc("Live now"),
      title: loc("Flash deals end when the counter does"),
      subtitle: loc("Every discount below is live right now — nothing expired, nothing padded."),
      ctaLabel: loc("Jump to coupons"),
      ctaHref: "/offers#coupons",
      icon: "Flame",
      tone: "accent",
    },
  });

  // ── Pages ────────────────────────────────────────────────────────────────
  seeds.push({
    collection: "pages",
    key: "about",
    sort: 1,
    fallbacks: { eyebrow: "about.eyebrow", title: "about.title" },
    values: {
      lead: loc(aboutMission),
      story: loc(aboutStory.join("\n\n")),
      stats: statRows(aboutStats),
      values: propRows(aboutValues),
      timeline: timelineRows(aboutTimeline),
    },
    fields: [
      { key: "story", label: "Story", type: "textarea", localized: true, rows: 8, help: "A blank line starts a new paragraph." },
      { key: "stats", label: "Headline numbers", type: "repeater", max: 8, fields: statFields },
      { key: "values", label: "What we optimise for", type: "repeater", max: 8, fields: valuePropFields },
      {
        key: "timeline",
        label: "Milestones",
        type: "repeater",
        max: 12,
        fields: [
          { key: "year", label: "Year", type: "text", required: true },
          { key: "title", label: "Title", type: "text", localized: true, required: true },
          { key: "description", label: "Body", type: "textarea", localized: true, rows: 2 },
        ],
      },
    ],
  });

  seeds.push({
    collection: "pages",
    key: "careers",
    sort: 2,
    fallbacks: { eyebrow: "careers.eyebrow", title: "careers.title" },
    values: {
      lead: loc(careersIntro),
      perks: propRows(careersPerks, "p"),
      jobs: jobRows(jobOpenings),
    },
    fields: [
      { key: "perks", label: "How we work", type: "repeater", max: 8, fields: valuePropFields },
      { key: "jobs", label: "Open roles", type: "repeater", max: 30, fields: jobFields },
    ],
  });

  seeds.push({
    collection: "pages",
    key: "help",
    sort: 3,
    fallbacks: { eyebrow: "help.eyebrow", title: "help.title", lead: "help.lead" },
    values: { channels: channelRows(helpChannels) },
    fields: [
      { key: "channels", label: "Support channels", type: "repeater", max: 8, fields: channelFields },
    ],
  });

  seeds.push({
    collection: "pages",
    key: "partner",
    sort: 4,
    fallbacks: { eyebrow: "partner.eyebrow", title: "partner.title" },
    values: {
      lead: loc(partnerIntro),
      stats: statRows(partnerStats),
      values: propRows(partnerValues),
      steps: stepRows(partnerSteps),
    },
    fields: [
      { key: "stats", label: "Headline numbers", type: "repeater", max: 8, fields: statFields },
      { key: "values", label: "What you get", type: "repeater", max: 8, fields: valuePropFields },
      { key: "steps", label: "How to join", type: "repeater", max: 8, fields: valuePropFields },
    ],
  });

  seeds.push({
    collection: "pages",
    key: "rider",
    sort: 5,
    fallbacks: { eyebrow: "rider.eyebrow", title: "rider.title" },
    values: {
      lead: loc(riderIntro),
      stats: statRows(riderStats),
      values: propRows(riderValues),
      steps: stepRows(riderSteps),
    },
    fields: [
      { key: "stats", label: "Headline numbers", type: "repeater", max: 8, fields: statFields },
      { key: "values", label: "Why ride with us", type: "repeater", max: 8, fields: valuePropFields },
      { key: "steps", label: "Getting on the road", type: "repeater", max: 8, fields: valuePropFields },
    ],
  });

  seeds.push({
    collection: "pages",
    key: "contact",
    sort: 6,
    values: {
      eyebrow: loc("Contact"),
      title: loc("Talk to a human"),
      lead: loc(
        "Support, partnerships, press or a complaint that needs a person rather than a help article — this is the way in.",
      ),
      intro: loc(
        "We answer in the order things arrive, with one exception: anything about a live order jumps the queue. If your food is on its way, use the order page — support opens with the whole timeline already in front of them.\n\nEverything else lands with the team that owns it. Partnerships and press go straight to the people who can say yes.",
      ),
      formTitle: loc("Send us a message"),
      formNote: loc(
        "This is a prototype: nothing is emailed to anyone. The message is validated, recorded on this device and shown to operations, exactly as the real form will be.",
      ),
      channels: [
        row("c1", {
          icon: "Headphones",
          title: loc("Customer support"),
          description: loc("Orders, refunds, missing items and account trouble."),
          actionLabel: loc("Open the help centre"),
          href: "/help",
          availability: loc("24/7"),
        }),
        row("c2", {
          icon: "Store",
          title: loc("Partnerships"),
          description: loc("List a restaurant, cafe, cloud kitchen or home kitchen."),
          actionLabel: loc("Partner with us"),
          href: "/partner",
          availability: loc("Mon–Fri, 9:00–18:00"),
        }),
        row("c3", {
          icon: "Bike",
          title: loc("Rider support"),
          description: loc("Shifts, payouts, kit and anything that happened on the road."),
          actionLabel: loc("Ride with us"),
          href: "/rider",
          availability: loc("Daily, 7:00–23:00"),
        }),
        row("c4", {
          icon: "Newspaper",
          title: loc("Press"),
          description: loc("Interviews, data requests and brand assets."),
          actionLabel: loc("Email the press desk"),
          href: "mailto:press@foodora.example.com",
          availability: loc("Mon–Fri"),
        }),
      ],
      offices: [
        row("o1", {
          city: loc("Dhaka"),
          address: loc("Level 7, Gulshan Avenue 41, Dhaka 1212, Bangladesh"),
          phone: "+880 1700 000000",
          hours: loc("Mon–Fri, 9:00–18:00"),
        }),
        row("o2", {
          city: loc("Dubai"),
          address: loc("Office 1104, Business Bay Tower, Dubai, UAE"),
          phone: "+971 4 000 0000",
          hours: loc("Sun–Thu, 9:00–18:00"),
        }),
        row("o3", {
          city: loc("London"),
          address: loc("2nd Floor, 14 Curtain Road, London EC2A 3PT, UK"),
          phone: "+44 20 0000 0000",
          hours: loc("Mon–Fri, 9:00–17:30"),
        }),
      ],
    },
    fields: [
      { key: "intro", label: "Introduction", type: "textarea", localized: true, rows: 6 },
      { key: "channels", label: "Contact channels", type: "repeater", max: 8, fields: channelFields },
      {
        key: "offices",
        label: "Offices",
        type: "repeater",
        max: 8,
        fields: [
          { key: "city", label: "City", type: "text", localized: true, required: true },
          { key: "address", label: "Address", type: "textarea", localized: true, rows: 2 },
          { key: "phone", label: "Phone", type: "text" },
          { key: "hours", label: "Hours", type: "text", localized: true },
        ],
      },
      { key: "formTitle", label: "Form heading", type: "text", localized: true },
      { key: "formNote", label: "Form note", type: "textarea", localized: true, rows: 3 },
    ],
  });

  // ── Legal ────────────────────────────────────────────────────────────────
  legalDocs.forEach((doc, index) => {
    seeds.push({
      collection: "legal",
      key: doc.slug,
      sort: index + 1,
      values: {
        title: loc(doc.title),
        intro: loc(doc.intro),
        effectiveFrom: doc.effectiveFrom,
        sections: sectionRows(doc.sections),
      },
    });
  });

  // The refund policy the footer has always pointed at nothing for (spec: CMS —
  // Refund). Authored here because it did not exist before this phase.
  seeds.push({
    collection: "legal",
    key: "refund",
    sort: legalDocs.length + 1,
    values: {
      title: loc("Refund policy"),
      intro: loc(
        "When an order goes wrong, this is what you get back and how quickly. It applies to every vendor on FoodOra: a kitchen cannot write its own refund rules on top of these.",
      ),
      effectiveFrom: "2026-06-01",
      sections: [
        row("sec1", {
          id: "when-you-are-refunded",
          heading: loc("1. When you are refunded"),
          body: loc(
            "You are refunded in full when an order never arrives, arrives with items missing, or arrives in a state no one would accept — cold food from a late delivery, a spilled container, the wrong order entirely.\n\nYou are refunded in part when some of the order was fine. We refund the items that were not, plus the delivery fee where the fault was ours or the rider's.",
          ),
          bullets: loc(
            "Report it within 48 hours from the order page.\nA photo settles most claims in one message.\nCancellations before the kitchen starts are always free.",
          ),
        }),
        row("sec2", {
          id: "how-fast",
          heading: loc("2. How fast the money moves"),
          body: loc(
            "A refund to your FoodOra wallet is instant, because it is a ledger we own — the credit is posted the moment the claim is accepted.\n\nA refund to a card is a bank's business: we release it immediately and it appears in three to five working days. Cash orders are refunded to the wallet, since there is nothing to reverse.",
          ),
        }),
        row("sec3", {
          id: "what-is-not-refunded",
          heading: loc("3. What is not refunded"),
          body: loc(
            "Taste is not a defect. We do not refund an order because a dish was not to your liking, and we will say so plainly rather than quietly declining.\n\nWe also do not refund an order you asked to be left unattended and cannot then find, a wrong address you entered, or a claim made after 48 hours with no reason for the delay.",
          ),
        }),
        row("sec4", {
          id: "vendor-and-rider",
          heading: loc("4. Who actually pays"),
          body: loc(
            "This matters to vendors and riders, so it is written down: a refund caused by the kitchen is charged to the kitchen, one caused by delivery is charged to the platform, and one caused by a rider's error is charged to the platform and reviewed with the rider. A rider is never charged for a kitchen's mistake.",
          ),
        }),
        row("sec5", {
          id: "disputes",
          heading: loc("5. If you disagree with a decision"),
          body: loc(
            "Reply to the decision message and it goes to a second reviewer who did not make the first call. If you are in the EU or the UK you keep every statutory right this policy does not grant you; nothing here removes them.",
          ),
        }),
      ],
    },
  });

  // ── Blog ─────────────────────────────────────────────────────────────────
  posts.forEach((post, index) => {
    seeds.push({
      collection: "posts",
      key: post.slug,
      sort: index + 1,
      values: {
        slug: post.slug,
        title: loc(post.title),
        excerpt: loc(post.excerpt),
        cover: post.cover,
        category: post.category,
        author: post.author,
        authorRole: loc(post.authorRole),
        authorAvatar: post.authorAvatar,
        readMinutes: post.readMinutes,
        publishedAt: post.publishedAt,
        tags: post.tags,
        body: post.body.map((block, i) => {
          const id = `b${i + 1}`;
          if (block.type === "list") return row(id, { type: "list", text: loc(block.items.join("\n")) });
          if (block.type === "quote") {
            return row(id, { type: "quote", text: loc(block.text), cite: block.cite ?? "" });
          }
          return row(id, { type: block.type, text: loc(block.text) });
        }),
      },
    });
  });

  // ── FAQs ─────────────────────────────────────────────────────────────────
  const faqSeeds: { surface: string; groups: FaqGroup[] }[] = [
    { surface: "help", groups: helpFaqs },
    { surface: "partner", groups: partnerFaqs },
    { surface: "rider", groups: riderFaqs },
  ];

  let faqSort = 0;
  for (const { surface, groups } of faqSeeds) {
    for (const group of groups) {
      faqSort += 1;
      seeds.push({
        collection: "faqs",
        key: group.id,
        sort: faqSort,
        values: {
          surface,
          title: loc(group.title),
          icon: group.icon,
          items: group.items.map((item, i) =>
            row(`q${i + 1}`, { question: loc(item.question), answer: loc(item.answer) }),
          ),
        },
      });
    }
  }

  // ── Categories ───────────────────────────────────────────────────────────
  categories.forEach((category) => {
    seeds.push({
      collection: "categories",
      key: category.slug,
      sort: category.sort,
      values: {
        slug: category.slug,
        name: loc(category.name),
        emoji: category.emoji,
        image: category.image,
        keywords: category.keywords,
      },
    });
  });

  // ── Navigation ───────────────────────────────────────────────────────────
  seeds.push({
    collection: "menus",
    key: "header",
    sort: 1,
    locked: true,
    values: {
      name: "Header navigation",
      items: primaryNav.map((item, i) =>
        row(`h${i + 1}`, {
          labelKey: item.labelKey,
          href: item.href,
          icon: item.iconName,
          group: item.group,
          visible: true,
        }),
      ),
    },
  });

  seeds.push({
    collection: "menus",
    key: "footer",
    sort: 2,
    locked: true,
    values: {
      name: "Footer navigation",
      items: (["company", "legal", "business"] as const).flatMap((group, groupIndex) =>
        footerNav[group].map((item, i) =>
          row(`f${groupIndex + 1}${i + 1}`, {
            labelKey: item.labelKey,
            href: item.href,
            icon: "FileText",
            group,
            visible: true,
          }),
        ),
      ),
    },
  });

  // ── SEO ──────────────────────────────────────────────────────────────────
  const seoSeeds: { route: string; fallbacks: Record<string, string> }[] = [
    { route: "/about", fallbacks: { metaTitle: "about.metaTitle", metaDescription: "about.metaDescription" } },
    { route: "/careers", fallbacks: { metaTitle: "careers.metaTitle", metaDescription: "careers.metaDescription" } },
    { route: "/help", fallbacks: { metaTitle: "help.metaTitle", metaDescription: "help.metaDescription" } },
    { route: "/blog", fallbacks: { metaTitle: "blog.metaTitle", metaDescription: "blog.metaDescription" } },
    { route: "/offers", fallbacks: { metaTitle: "offers.metaTitle", metaDescription: "offers.metaDescription" } },
  ];

  seoSeeds.forEach((seed, index) => {
    seeds.push({
      collection: "seo",
      key: seed.route.replace(/^\//, "") || "home",
      sort: index + 1,
      values: { route: seed.route, noindex: false },
      fallbacks: seed.fallbacks,
    });
  });

  seeds.push({
    collection: "seo",
    key: "contact",
    sort: seoSeeds.length + 1,
    values: {
      route: "/contact",
      metaTitle: loc("Contact FoodOra"),
      metaDescription: loc(
        "Support, partnerships, rider help and press — every way to reach a person at FoodOra, and which one is fastest.",
      ),
      noindex: false,
    },
  });

  seeds.push({
    collection: "seo",
    key: "refund",
    sort: seoSeeds.length + 2,
    values: {
      route: "/refund",
      metaTitle: loc("Refund policy"),
      metaDescription: loc(
        "What FoodOra refunds, how fast the money moves, what is not refundable, and who pays for it.",
      ),
      noindex: false,
    },
  });

  // ── Site ─────────────────────────────────────────────────────────────────
  seeds.push({
    collection: "site",
    key: "site",
    sort: 1,
    locked: true,
    fallbacks: { tagline: "common.tagline" },
    values: {
      brandName: "FoodOra",
      description: loc(
        "Discover restaurants, cafes, cloud kitchens, home chefs and catering. Order food, book tables, plan events — all in one global platform.",
      ),
      supportEmail: "support@foodora.example.com",
      supportPhone: "+880 1700 000000",
      address: loc("Level 7, Gulshan Avenue 41, Dhaka 1212, Bangladesh"),
      twitter: "https://twitter.com/foodora",
      instagram: "https://instagram.com/foodora",
      facebook: "https://facebook.com/foodora",
      footerNote: loc("Prototype — mock data only."),
    },
  });

  return seeds.map((seed) => makeDoc(seed, now));
}
