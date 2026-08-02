/**
 * cms.ts — the content model behind every editable surface (Phase C26).
 *
 * The spec asks for one thing: *every content should be dynamic, nothing
 * hardcoded*. Thirteen bespoke editors would have satisfied the letter of that
 * and none of its spirit, so this is a **schema-driven** CMS instead: a
 * collection declares its fields, a document holds values against them, and one
 * editor renders any collection. Adding a field is a line of schema, not a
 * component.
 *
 * Two decisions carry the design:
 *
 * 1. **A document is generic; the typed shape is a projection.** `values` is a
 *    map, not a `LegalDoc`. `lib/cms.ts` projects a document back into the
 *    domain type each surface already renders (`LegalDoc`, `FaqGroup`,
 *    `BlogPost`, `Category`…), so no component learns the CMS exists. In Phase E
 *    the projection reads a `cms_documents` row instead of the seed; every
 *    signature stays.
 *
 * 2. **Text is localized, with an i18n key behind it.** A field value is one
 *    string *per locale* (`CmsLocalizedText`), and a document may declare a
 *    `fallbacks` key per field. Resolution is: this locale's authored text →
 *    the field's message key (itself translated) → the default locale's authored
 *    text. That is what lets the CMS take ownership of copy that lives in the
 *    message catalogs today — the landing hero, the nav labels — without
 *    duplicating a single translated string, and it keeps Bangla and Arabic
 *    correct until someone deliberately overrides them.
 */
import type { Locale } from "@/config/i18n/config";
import type { BaseEntity, ISODate } from "./common";

/** The content groups the admin lists (spec: Content Management). */
export type CmsCollectionId =
  | "banners"
  | "pages"
  | "legal"
  | "posts"
  | "faqs"
  | "categories"
  | "menus"
  | "seo"
  | "site";

/**
 * What an editor is given for a field. Deliberately small: every richer shape
 * (a paragraph run, a bullet list) is a `textarea` split on newlines by the
 * projection, and every repeating shape is a `repeater` of scalars. Nesting a
 * repeater inside a repeater would have doubled the editor and bought nothing
 * the split does not already give.
 */
export type CmsFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "date"
  | "image"
  | "url"
  | "icon"
  | "emoji"
  | "select"
  | "list"
  | "repeater";

export interface CmsFieldDef {
  /** Key inside the document's (or the row's) value map. */
  key: string;
  /**
   * Field name shown in the editor. Authored, not translated — a field label is
   * content-model metadata, the same call `types/content.ts` makes for a vendor
   * name or a post title.
   */
  label: string;
  type: CmsFieldType;
  /** Holds one string per locale. Only `text` and `textarea` may be localized. */
  localized?: boolean;
  required?: boolean;
  /** One-line help under the control. */
  help?: string;
  /** Options for `select`. */
  options?: { value: string; label: string }[];
  /** Row shape for `repeater` (scalar fields only). */
  fields?: CmsFieldDef[];
  /** Character limit for text, row limit for a repeater. */
  max?: number;
  /** Rows for a `textarea`. */
  rows?: number;
}

export interface CmsCollectionDef {
  id: CmsCollectionId;
  /** Admin label + what it drives, authored (see `CmsFieldDef.label`). */
  label: string;
  description: string;
  /** Lucide name, resolved by `components/directory/dash-icon`. */
  icon: string;
  /** Where the public site renders it — shown in the admin as a preview link. */
  surface: string;
  /** Route the "view" link opens, when there is a single one. */
  previewHref?: string;
  /** Fields every document in the collection has. */
  fields: CmsFieldDef[];
  /** Editors may add and archive documents here. */
  creatable?: boolean;
  /** Document order is meaningful (banners, menu items, categories). */
  orderable?: boolean;
  /** Value key used as the document's title in lists. */
  titleField: string;
}

/** One string per locale; a locale absent means "not authored yet". */
export type CmsLocalizedText = Partial<Record<Locale, string>>;

export type CmsScalar = string | number | boolean;

/** A repeater row. `id` is stable so reordering never remounts the wrong row. */
export interface CmsRow {
  id: string;
  values: Record<string, CmsScalar | CmsLocalizedText>;
}

export type CmsValue = CmsScalar | string[] | CmsLocalizedText | CmsRow[];

export type CmsValues = Record<string, CmsValue>;

/**
 * Publication state, **derived** rather than stored (the C15/C16/C21
 * convention): a window that has not opened reads `scheduled` and one that has
 * closed reads `expired`, with nothing sweeping a table to make it true.
 * Unpublished changes are a separate axis — see `CmsDocumentView`.
 */
export type CmsStatus = "published" | "draft" | "scheduled" | "expired" | "archived";

export interface CmsDocument extends BaseEntity {
  collection: CmsCollectionId;
  /** Stable handle the code asks for: "home-hero", "terms", "header". */
  key: string;
  /** Published values — what the site renders. */
  values: CmsValues;
  /** Unpublished edits; `null` when there is no open draft. */
  draft: CmsValues | null;
  /** Sort weight inside the collection. */
  sort: number;
  /** Publication window. `null` on both sides = live as soon as published. */
  publishAt: ISODate | null;
  unpublishAt: ISODate | null;
  /** First publication; `null` for a document that has never been live. */
  publishedAt: ISODate | null;
  archivedAt: ISODate | null;
  /** Display name of whoever last saved it. */
  updatedBy: string;
  /**
   * Structural documents (the menus, the site record) an editor may rewrite but
   * not delete — the site would lose a required surface.
   */
  locked?: boolean;
  /** Fields beyond the collection's, for a document with its own shape. */
  fields?: CmsFieldDef[];
  /** Field key → i18n message key used when no text is authored. */
  fallbacks?: Record<string, string>;
}

/** A saved snapshot of published values, so a publish is reversible. */
export interface CmsRevision {
  id: string;
  documentId: string;
  values: CmsValues;
  at: ISODate;
  by: string;
  /** What produced it: a publish, or a revert to an earlier revision. */
  reason: "publish" | "revert";
}

export type CmsAuditAction =
  | "created"
  | "saved"
  | "published"
  | "unpublished"
  | "reverted"
  | "archived"
  | "restored"
  | "discarded"
  | "reordered";

/** One line of the audit trail (spec: Admin Panel — Audit Logs). */
export interface CmsAuditEntry {
  id: string;
  documentId: string;
  collection: CmsCollectionId;
  /** Document title at the time, so the log stays readable after a rename. */
  title: string;
  action: CmsAuditAction;
  at: ISODate;
  by: string;
}

/** What the admin lists need beside the document itself. */
export interface CmsDocumentView {
  document: CmsDocument;
  status: CmsStatus;
  /** A draft is waiting to be published. */
  hasDraft: boolean;
  /** Localized-field coverage per locale, 0–1. */
  coverage: Record<Locale, number>;
  /** Values the editor should open with (draft if any, else published). */
  editing: CmsValues;
}

/** A field that failed validation, with the message key the UI translates. */
export interface CmsFieldError {
  /** `key`, or `key.rowId.subKey` inside a repeater. */
  path: string;
  error: string;
  params?: Record<string, string | number>;
}

/** The write payload — a whole value map, as a document PUT would take. */
export interface CmsSaveInput {
  documentId: string;
  values: CmsValues;
  /** Publish immediately instead of leaving a draft. */
  publish?: boolean;
  publishAt?: ISODate | null;
  unpublishAt?: ISODate | null;
  by: string;
  at: ISODate;
}

// ---------------------------------------------------------------------------
// Projections — the typed shapes the public surfaces consume
// ---------------------------------------------------------------------------

/** Where a banner renders. A placement is a slot, not a page. */
export type CmsBannerPlacement = "home-hero" | "home-strip" | "offers-top";

/** The landing hero, and every promotional strip (spec: Hero Banner, Promotions). */
export interface CmsBanner {
  id: string;
  key: string;
  placement: CmsBannerPlacement;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  /** Hero only: the address field's placeholder. */
  searchPlaceholder: string;
  icon: string;
  tone: "primary" | "ink" | "accent";
}

/** One resolved navigation entry (spec: Header, Footer, Menus). */
export interface CmsMenuItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  group: string;
}

/** Per-route metadata (spec: SEO Metadata). */
export interface CmsSeo {
  route: string;
  title: string;
  description: string;
  ogImage: string;
  noindex: boolean;
}

/** Brand-level content shared by the footer, the contact page and metadata. */
export interface CmsSite {
  brandName: string;
  tagline: string;
  description: string;
  supportEmail: string;
  supportPhone: string;
  address: string;
  twitter: string;
  instagram: string;
  facebook: string;
  footerNote: string;
}

/** A contact-page channel or office row. */
export interface CmsContactChannel {
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  availability: string;
}

export interface CmsOffice {
  city: string;
  address: string;
  phone: string;
  hours: string;
}

/** The `/contact` page (spec: CMS — Contact). */
export interface CmsContactContent {
  eyebrow: string;
  title: string;
  lead: string;
  intro: string;
  channels: CmsContactChannel[];
  offices: CmsOffice[];
  formTitle: string;
  formNote: string;
}

/** Reasons a visitor can pick in the contact form. */
export type CmsContactTopic = "order" | "partner" | "rider" | "press" | "other";

export interface CmsContactMessage {
  id: string;
  name: string;
  email: string;
  topic: CmsContactTopic;
  message: string;
  at: ISODate;
}
