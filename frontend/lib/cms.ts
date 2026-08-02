/**
 * cms.ts — the pure half of the CMS (Phase C26).
 *
 * Everything here is a function of its arguments: resolve a value, merge a
 * device's edits over the seed, derive a status, count what is translated,
 * validate a save, and project a generic document into the domain shape a
 * surface renders. No clock, no storage, no React — which is what lets the
 * admin, the seam, the public site and `scripts/cms-flow.ts` all ask the same
 * questions and get the same answers.
 *
 * The one rule worth reading twice is {@link resolveText}: authored text for
 * this locale wins, then the field's message key (already translated by the
 * catalog), then the default locale's authored text. A field is therefore
 * *translated until someone overrides it*, which is the only way a CMS can take
 * over copy that lives in three message catalogs without duplicating it.
 */
import { defaultLocale, locales, type Locale } from "@/frontend/config/i18n/config";
import type {
  BlogBlock,
  BlogPost,
  CmsAuditEntry,
  CmsBanner,
  CmsBannerPlacement,
  CmsCollectionDef,
  CmsContactChannel,
  CmsContactContent,
  CmsDocument,
  CmsFieldDef,
  CmsFieldError,
  CmsLocalizedText,
  CmsMenuItem,
  CmsOffice,
  CmsRow,
  CmsScalar,
  CmsSeo,
  CmsSite,
  CmsStatus,
  CmsValue,
  CmsValues,
  Category,
  DocSection,
  FaqGroup,
  FaqItem,
  HowStep,
  JobOpening,
  LegalDoc,
  StatItem,
  SupportChannel,
  TimelineEntry,
  ValueProp,
} from "@/frontend/types";

/** A translator — `useTranslations()` / `getTranslations()` without a namespace. */
export type CmsTranslate = (key: string) => string;

export interface CmsReadOptions {
  locale?: Locale;
  /**
   * Resolves a field's fallback message key. Optional: without it a
   * fallback-only field reads as the default locale's authored text (usually
   * empty), which is why every caller that renders chrome passes one.
   */
  translate?: CmsTranslate;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function isLocalized(value: CmsValue | undefined): value is CmsLocalizedText {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * The resolution order the whole phase rests on. `fallbackKey` is consulted
 * *before* the default locale so a Bangla visitor keeps the catalog's Bangla
 * string when only the English text has been overridden — falling through to
 * English there would silently untranslate the site.
 */
export function resolveText(
  value: CmsValue | undefined,
  { locale = defaultLocale, translate }: CmsReadOptions = {},
  fallbackKey?: string,
): string {
  const localized = isLocalized(value) ? value : undefined;
  const own = localized?.[locale];
  if (own && own.trim()) return own;

  if (fallbackKey && translate) {
    const translated = translate(fallbackKey);
    // next-intl echoes the path back when a key is missing; that is not content.
    if (translated && translated !== fallbackKey) return translated;
  }

  const fallbackLocale = localized?.[defaultLocale];
  if (fallbackLocale && fallbackLocale.trim()) return fallbackLocale;

  if (typeof value === "string") return value; // a field that was never localized
  return "";
}

/** Paragraphs from a textarea: blank line separates, single newline does not. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

/** One item per line — bullets, list blocks, tag columns. */
export function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** A typed reader over one document's values. Projections are written with it. */
export interface CmsReader {
  text: (key: string) => string;
  paragraphs: (key: string) => string[];
  lines: (key: string) => string[];
  str: (key: string, fallback?: string) => string;
  num: (key: string, fallback?: number) => number;
  bool: (key: string, fallback?: boolean) => boolean;
  list: (key: string) => string[];
  rows: (key: string) => CmsRow[];
  /** Localized text inside a repeater row. */
  rowText: (row: CmsRow, key: string) => string;
  rowStr: (row: CmsRow, key: string, fallback?: string) => string;
  rowNum: (row: CmsRow, key: string, fallback?: number) => number;
  rowBool: (row: CmsRow, key: string, fallback?: boolean) => boolean;
}

/**
 * Reader for a document's *published* values (or any value map handed in — the
 * editor's preview reads its draft through the same function).
 */
export function readerFor(
  doc: Pick<CmsDocument, "fallbacks">,
  values: CmsValues,
  options: CmsReadOptions = {},
): CmsReader {
  const fallbacks = doc.fallbacks ?? {};
  const text = (key: string) => resolveText(values[key], options, fallbacks[key]);

  return {
    text,
    paragraphs: (key) => splitParagraphs(text(key)),
    lines: (key) => splitLines(text(key)),
    str: (key, fallback = "") => {
      const value = values[key];
      if (typeof value === "string") return value;
      if (typeof value === "number") return String(value);
      if (isLocalized(value)) return text(key);
      return fallback;
    },
    num: (key, fallback = 0) => {
      const value = values[key];
      if (typeof value === "number") return value;
      const parsed = typeof value === "string" ? Number(value) : NaN;
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    bool: (key, fallback = false) => {
      const value = values[key];
      return typeof value === "boolean" ? value : fallback;
    },
    list: (key) => {
      const value = values[key];
      if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
      if (typeof value === "string") return splitLines(value);
      return [];
    },
    rows: (key) => {
      const value = values[key];
      if (!Array.isArray(value)) return [];
      return value.filter((row): row is CmsRow => typeof row === "object" && row !== null && "values" in row);
    },
    rowText: (row, key) => resolveText(row.values[key], options),
    rowStr: (row, key, fallback = "") => {
      const value = row.values[key];
      if (typeof value === "string") return value;
      if (typeof value === "number") return String(value);
      if (isLocalized(value)) return resolveText(value, options);
      return fallback;
    },
    rowNum: (row, key, fallback = 0) => {
      const value = row.values[key];
      if (typeof value === "number") return value;
      const parsed = typeof value === "string" ? Number(value) : NaN;
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    rowBool: (row, key, fallback = false) => {
      const value = row.values[key];
      return typeof value === "boolean" ? value : fallback;
    },
  };
}

/** Reader for whatever the site should currently render from a document. */
export function liveReader(doc: CmsDocument, options: CmsReadOptions = {}): CmsReader {
  return readerFor(doc, doc.values, options);
}

// ---------------------------------------------------------------------------
// Merging a device's edits over the seed
// ---------------------------------------------------------------------------

/**
 * What the browser keeps for one document. Values are merged shallowly rather
 * than replacing the map, so a field added to the seed after an edit was saved
 * still appears — the same reason an API PATCH beats a PUT against a schema
 * that is still moving.
 */
export interface CmsDocPatch {
  values?: CmsValues;
  draft?: CmsValues | null;
  publishAt?: string | null;
  unpublishAt?: string | null;
  publishedAt?: string | null;
  archivedAt?: string | null;
  sort?: number;
  updatedAt?: string;
  updatedBy?: string;
}

export function applyPatch(seed: CmsDocument, patch?: CmsDocPatch): CmsDocument {
  if (!patch) return seed;
  return {
    ...seed,
    values: patch.values ? { ...seed.values, ...patch.values } : seed.values,
    draft: patch.draft === undefined ? seed.draft : patch.draft,
    publishAt: patch.publishAt === undefined ? seed.publishAt : patch.publishAt,
    unpublishAt: patch.unpublishAt === undefined ? seed.unpublishAt : patch.unpublishAt,
    publishedAt: patch.publishedAt === undefined ? seed.publishedAt : patch.publishedAt,
    archivedAt: patch.archivedAt === undefined ? seed.archivedAt : patch.archivedAt,
    sort: patch.sort ?? seed.sort,
    updatedAt: patch.updatedAt ?? seed.updatedAt,
    updatedBy: patch.updatedBy ?? seed.updatedBy,
  };
}

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

/** Publication state, derived from the window and the archive marker. */
export function statusOf(doc: CmsDocument, now: number): CmsStatus {
  if (doc.archivedAt) return "archived";
  if (!doc.publishedAt) return "draft";
  if (doc.publishAt && Date.parse(doc.publishAt) > now) return "scheduled";
  if (doc.unpublishAt && Date.parse(doc.unpublishAt) <= now) return "expired";
  return "published";
}

/** Only a `published` document reaches the public site. */
export function isLive(doc: CmsDocument, now: number): boolean {
  return statusOf(doc, now) === "published";
}

/** Every field an editor sees: the collection's, plus the document's own. */
export function fieldsOf(def: CmsCollectionDef, doc: CmsDocument): CmsFieldDef[] {
  return [...def.fields, ...(doc.fields ?? [])];
}

/** The localizable leaves of a document, repeater rows included. */
function localizedSlots(
  fields: CmsFieldDef[],
  values: CmsValues,
): { key: string; value: CmsValue | undefined; fallbackOf: string }[] {
  const slots: { key: string; value: CmsValue | undefined; fallbackOf: string }[] = [];

  for (const field of fields) {
    if (field.type === "repeater") {
      const rows = Array.isArray(values[field.key]) ? (values[field.key] as CmsRow[]) : [];
      for (const row of rows) {
        if (typeof row !== "object" || !("values" in row)) continue;
        for (const sub of field.fields ?? []) {
          if (!sub.localized) continue;
          slots.push({ key: `${field.key}.${row.id}.${sub.key}`, value: row.values[sub.key], fallbackOf: field.key });
        }
      }
      continue;
    }
    if (field.localized) {
      slots.push({ key: field.key, value: values[field.key], fallbackOf: field.key });
    }
  }

  return slots;
}

/**
 * Translation coverage per locale, 0–1.
 *
 * Two fields are deliberately *not* counted as gaps. One backed by a message key
 * is already translated by the catalog, and flagging it would push an editor to
 * paste English over three working translations. One that holds no text in any
 * locale is unused, not untranslated — an optional field left empty is a choice,
 * and counting it would make every document look half-finished.
 */
export function coverageOf(
  def: CmsCollectionDef,
  doc: CmsDocument,
  values: CmsValues = doc.values,
): Record<Locale, number> {
  const fallbacks = doc.fallbacks ?? {};
  const slots = localizedSlots(fieldsOf(def, doc), values).filter((slot) => {
    if (fallbacks[slot.fallbackOf]) return true;
    return locales.some((locale) => {
      const text = isLocalized(slot.value) ? slot.value[locale] : undefined;
      return Boolean(text && text.trim());
    });
  });

  const coverage = {} as Record<Locale, number>;

  for (const locale of locales) {
    if (slots.length === 0) {
      coverage[locale] = 1;
      continue;
    }
    const filled = slots.filter((slot) => {
      const text = isLocalized(slot.value) ? slot.value[locale] : undefined;
      if (text && text.trim()) return true;
      return Boolean(fallbacks[slot.fallbackOf]);
    }).length;
    coverage[locale] = filled / slots.length;
  }

  return coverage;
}

/** Locales missing at least one authored string, worst first. */
export function translationGaps(coverage: Record<Locale, number>): Locale[] {
  return locales.filter((locale) => coverage[locale] < 1).sort((a, b) => coverage[a] - coverage[b]);
}

// ---------------------------------------------------------------------------
// Validation — rules live here, and the seam re-runs them
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HREF_RE = /^(?:\/|https?:\/\/|mailto:|tel:|#)/;

function scalarText(value: CmsScalar | CmsLocalizedText | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (isLocalized(value)) return value[defaultLocale] ?? Object.values(value).find(Boolean) ?? "";
  return "";
}

function validateField(
  field: CmsFieldDef,
  value: CmsValue | undefined,
  path: string,
  errors: CmsFieldError[],
  hasFallback: boolean,
): void {
  if (field.type === "repeater") {
    const rows = Array.isArray(value) ? (value as CmsRow[]) : [];
    if (field.required && rows.length === 0) {
      errors.push({ path, error: "cms.errors.emptyRepeater" });
    }
    if (field.max && rows.length > field.max) {
      errors.push({ path, error: "cms.errors.tooManyRows", params: { max: field.max } });
    }
    for (const row of rows) {
      if (typeof row !== "object" || !("values" in row)) continue;
      for (const sub of field.fields ?? []) {
        validateField(sub, row.values[sub.key], `${path}.${row.id}.${sub.key}`, errors, false);
      }
    }
    return;
  }

  const text = field.localized
    ? scalarText(value as CmsLocalizedText | undefined)
    : scalarText(value as CmsScalar | undefined);

  if (field.required && !text.trim() && !hasFallback && typeof value !== "boolean") {
    errors.push({ path, error: "cms.errors.required" });
    return;
  }
  if (!text.trim()) return;

  if (field.max && text.length > field.max) {
    errors.push({ path, error: "cms.errors.tooLong", params: { max: field.max } });
  }
  if ((field.type === "url" || field.type === "image") && !HREF_RE.test(text)) {
    errors.push({ path, error: "cms.errors.href" });
  }
  if (field.type === "number" && !Number.isFinite(Number(text))) {
    errors.push({ path, error: "cms.errors.number" });
  }
  if (field.type === "date" && Number.isNaN(Date.parse(text))) {
    errors.push({ path, error: "cms.errors.date" });
  }
  if (field.type === "select" && field.options && !field.options.some((o) => o.value === text)) {
    errors.push({ path, error: "cms.errors.option" });
  }
  if (field.key === "slug" || field.key === "route") {
    const candidate = field.key === "route" ? text.replace(/^\//, "") : text;
    if (candidate && !SLUG_RE.test(candidate) && text !== "/") {
      errors.push({ path, error: "cms.errors.slug" });
    }
  }
}

/**
 * Every rule a save has to pass, as message keys. The editor calls this to draw
 * inline errors and `services/cms.ts` calls it again before writing — a form
 * that has been open since before a field became required is exactly the case a
 * disabled button does not cover.
 */
export function validateValues(
  def: CmsCollectionDef,
  doc: CmsDocument,
  values: CmsValues,
): CmsFieldError[] {
  const errors: CmsFieldError[] = [];
  const fallbacks = doc.fallbacks ?? {};

  for (const field of fieldsOf(def, doc)) {
    validateField(field, values[field.key], field.key, errors, Boolean(fallbacks[field.key]));
  }

  return errors;
}

/** A publication window has to run forwards. */
export function validateWindow(
  publishAt: string | null | undefined,
  unpublishAt: string | null | undefined,
): CmsFieldError[] {
  if (!publishAt || !unpublishAt) return [];
  if (Date.parse(unpublishAt) > Date.parse(publishAt)) return [];
  return [{ path: "unpublishAt", error: "cms.errors.window" }];
}

// ---------------------------------------------------------------------------
// Projections — a document, as the surface's own type
// ---------------------------------------------------------------------------

export function toBanner(doc: CmsDocument, options: CmsReadOptions = {}): CmsBanner {
  const read = liveReader(doc, options);
  const tone = read.str("tone", "primary");
  return {
    id: doc.id,
    key: doc.key,
    placement: (read.str("placement", "home-strip") as CmsBannerPlacement) || "home-strip",
    eyebrow: read.text("eyebrow"),
    title: read.text("title"),
    subtitle: read.text("subtitle"),
    ctaLabel: read.text("ctaLabel"),
    ctaHref: read.str("ctaHref", "/search"),
    searchPlaceholder: read.text("searchPlaceholder"),
    icon: read.str("icon", "Sparkles"),
    tone: tone === "ink" || tone === "accent" ? tone : "primary",
  };
}

export function toMenuItems(doc: CmsDocument, options: CmsReadOptions = {}): CmsMenuItem[] {
  const read = liveReader(doc, options);
  const { translate } = options;

  return read
    .rows("items")
    .filter((row) => read.rowBool(row, "visible", true))
    .map((row) => {
      const authored = resolveText(row.values.label, options);
      const key = read.rowStr(row, "labelKey");
      const label = authored || (key && translate ? translate(key) : "") || key;
      return {
        id: row.id,
        label,
        href: read.rowStr(row, "href", "/"),
        icon: read.rowStr(row, "icon", "Sparkles"),
        group: read.rowStr(row, "group", "discover"),
      };
    })
    .filter((item) => item.label && item.href);
}

export function toFaqGroup(doc: CmsDocument, options: CmsReadOptions = {}): FaqGroup {
  const read = liveReader(doc, options);
  const items: FaqItem[] = read.rows("items").map((row) => ({
    question: read.rowText(row, "question"),
    answer: read.rowText(row, "answer"),
  }));

  return {
    id: doc.key,
    title: read.text("title"),
    icon: read.str("icon", "Sparkles"),
    items: items.filter((item) => item.question && item.answer),
  };
}

/** Which page a FAQ group belongs to — help, partner or rider. */
export function faqSurfaceOf(doc: CmsDocument): string {
  const value = doc.values.surface;
  return typeof value === "string" ? value : "help";
}

export function toLegalDoc(doc: CmsDocument, options: CmsReadOptions = {}): LegalDoc {
  const read = liveReader(doc, options);

  const sections: DocSection[] = read.rows("sections").map((row, index) => {
    const bullets = splitLines(read.rowText(row, "bullets"));
    return {
      id: read.rowStr(row, "id") || `section-${index + 1}`,
      heading: read.rowText(row, "heading"),
      paragraphs: splitParagraphs(read.rowText(row, "body")),
      ...(bullets.length ? { bullets } : {}),
    };
  });

  return {
    id: doc.id,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.archivedAt,
    slug: doc.key,
    title: read.text("title"),
    intro: read.text("intro"),
    effectiveFrom: read.str("effectiveFrom", doc.updatedAt),
    sections: sections.filter((section) => section.heading),
  };
}

export function toBlogPost(doc: CmsDocument, options: CmsReadOptions = {}): BlogPost {
  const read = liveReader(doc, options);

  const body: BlogBlock[] = read.rows("body").flatMap((row) => {
    const type = read.rowStr(row, "type", "paragraph");
    const text = read.rowText(row, "text");
    if (!text.trim()) return [];
    if (type === "heading") return [{ type: "heading", text } as BlogBlock];
    if (type === "list") return [{ type: "list", items: splitLines(text) } as BlogBlock];
    if (type === "quote") {
      const cite = read.rowStr(row, "cite");
      return [{ type: "quote", text, ...(cite ? { cite } : {}) } as BlogBlock];
    }
    return splitParagraphs(text).map((paragraph) => ({ type: "paragraph", text: paragraph }) as BlogBlock);
  });

  return {
    id: doc.id,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.archivedAt,
    slug: read.str("slug", doc.key),
    title: read.text("title"),
    excerpt: read.text("excerpt"),
    cover: read.str("cover"),
    category: read.str("category", "Guides"),
    author: read.str("author"),
    authorRole: read.str("authorRole"),
    authorAvatar: read.str("authorAvatar"),
    readMinutes: read.num("readMinutes", 4),
    publishedAt: read.str("publishedAt", doc.publishedAt ?? doc.updatedAt),
    tags: read.list("tags"),
    body,
  };
}

export function toCategory(doc: CmsDocument, options: CmsReadOptions = {}): Category {
  const read = liveReader(doc, options);
  return {
    id: doc.id,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.archivedAt,
    slug: read.str("slug", doc.key),
    name: read.text("name"),
    emoji: read.str("emoji", ""),
    image: read.str("image", ""),
    sort: doc.sort,
    keywords: read.list("keywords"),
  };
}

export function toSeo(doc: CmsDocument, options: CmsReadOptions = {}): CmsSeo {
  const read = liveReader(doc, options);
  return {
    route: read.str("route", "/"),
    title: read.text("metaTitle"),
    description: read.text("metaDescription"),
    ogImage: read.str("ogImage"),
    noindex: read.bool("noindex"),
  };
}

export function toSite(doc: CmsDocument, options: CmsReadOptions = {}): CmsSite {
  const read = liveReader(doc, options);
  return {
    brandName: read.str("brandName", "FoodOra"),
    tagline: read.text("tagline"),
    description: read.text("description"),
    supportEmail: read.str("supportEmail"),
    supportPhone: read.str("supportPhone"),
    address: read.text("address"),
    twitter: read.str("twitter"),
    instagram: read.str("instagram"),
    facebook: read.str("facebook"),
    footerNote: read.text("footerNote"),
  };
}

function toChannels(doc: CmsDocument, key: string, options: CmsReadOptions): CmsContactChannel[] {
  const read = liveReader(doc, options);
  return read
    .rows(key)
    .map((row) => ({
      icon: read.rowStr(row, "icon", "Headphones"),
      title: read.rowText(row, "title"),
      description: read.rowText(row, "description"),
      actionLabel: read.rowText(row, "actionLabel"),
      href: read.rowStr(row, "href", "/help"),
      availability: read.rowText(row, "availability"),
    }))
    .filter((channel) => channel.title);
}

/** A support channel is the same row shape on `/help` and `/contact`. */
export function toSupportChannels(doc: CmsDocument, options: CmsReadOptions = {}): SupportChannel[] {
  return toChannels(doc, "channels", options);
}

export function toContactContent(doc: CmsDocument, options: CmsReadOptions = {}): CmsContactContent {
  const read = liveReader(doc, options);
  const offices: CmsOffice[] = read.rows("offices").map((row) => ({
    city: read.rowText(row, "city"),
    address: read.rowText(row, "address"),
    phone: read.rowStr(row, "phone"),
    hours: read.rowText(row, "hours"),
  }));

  return {
    eyebrow: read.text("eyebrow"),
    title: read.text("title"),
    lead: read.text("lead"),
    intro: read.text("intro"),
    channels: toChannels(doc, "channels", options),
    offices: offices.filter((office) => office.city),
    formTitle: read.text("formTitle"),
    formNote: read.text("formNote"),
  };
}

/** The shared heading band of any marketing page. */
export interface CmsPageHero {
  eyebrow: string;
  title: string;
  lead: string;
}

export function toPageHero(doc: CmsDocument, options: CmsReadOptions = {}): CmsPageHero {
  const read = liveReader(doc, options);
  return { eyebrow: read.text("eyebrow"), title: read.text("title"), lead: read.text("lead") };
}

export function toValueProps(
  doc: CmsDocument,
  key: string,
  options: CmsReadOptions = {},
): ValueProp[] {
  const read = liveReader(doc, options);
  return read
    .rows(key)
    .map((row) => ({
      icon: read.rowStr(row, "icon", "Sparkles"),
      title: read.rowText(row, "title"),
      description: read.rowText(row, "description"),
    }))
    .filter((item) => item.title);
}

export function toStats(doc: CmsDocument, key: string, options: CmsReadOptions = {}): StatItem[] {
  const read = liveReader(doc, options);
  return read
    .rows(key)
    .map((row) => ({ value: read.rowStr(row, "value"), label: read.rowText(row, "label") }))
    .filter((stat) => stat.value && stat.label);
}

export function toSteps(doc: CmsDocument, key: string, options: CmsReadOptions = {}): HowStep[] {
  const read = liveReader(doc, options);
  return read
    .rows(key)
    .map((row) => ({
      icon: read.rowStr(row, "icon", "Sparkles"),
      title: read.rowText(row, "title"),
      description: read.rowText(row, "description"),
    }))
    .filter((step) => step.title);
}

export function toTimeline(doc: CmsDocument, options: CmsReadOptions = {}): TimelineEntry[] {
  const read = liveReader(doc, options);
  return read
    .rows("timeline")
    .map((row) => ({
      year: read.rowStr(row, "year"),
      title: read.rowText(row, "title"),
      description: read.rowText(row, "description"),
    }))
    .filter((entry) => entry.year && entry.title);
}

export function toJobs(doc: CmsDocument, options: CmsReadOptions = {}): JobOpening[] {
  const read = liveReader(doc, options);
  return read
    .rows("jobs")
    .map((row) => ({
      id: `job_${row.id}`,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      deletedAt: null,
      slug: read.rowStr(row, "slug"),
      title: read.rowText(row, "title"),
      team: read.rowText(row, "team"),
      location: read.rowText(row, "location"),
      employment: read.rowText(row, "employment"),
      workplace: read.rowText(row, "workplace"),
      summary: read.rowText(row, "summary"),
    }))
    .filter((job) => job.title);
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** Newest first, ties broken by id so a re-render never reshuffles a batch. */
export function byRecency(a: CmsAuditEntry, b: CmsAuditEntry): number {
  const delta = Date.parse(b.at) - Date.parse(a.at);
  return delta !== 0 ? delta : b.id.localeCompare(a.id);
}

/** A document's title for the audit trail, in the default locale. */
export function titleOf(def: CmsCollectionDef, doc: CmsDocument, values: CmsValues = doc.values): string {
  const value = values[def.titleField];
  const text = isLocalized(value) ? value[defaultLocale] ?? Object.values(value).find(Boolean) : value;
  if (typeof text === "string" && text.trim()) return text;
  if (typeof text === "number") return String(text);
  return doc.key;
}
