/**
 * cms.ts — the content seam (Phase C26).
 *
 * Every editable surface reads through here, and every edit is written through
 * here. Three conventions from earlier phases apply unchanged:
 *
 * - **The seam owns the clock.** Publication windows are compared against `now`
 *   in this file, so the seed can be stamped with offsets and a scheduled banner
 *   is always genuinely in the future (`buildOffers`, C20).
 * - **The seam owns the rules.** A save is validated here even though the editor
 *   already validated it — a form can sit open while a field becomes required,
 *   and a disabled button is a courtesy, not a control (C21/C22).
 * - **The device's edits arrive as context.** There is no server, so the browser
 *   holds drafts, published overrides, revisions and the audit trail, and hands
 *   them in as `CmsContext` (the `ReviewContext` pattern, C22). A write does not
 *   mutate anything: it returns the `CmsMutation` the store commits, which is
 *   what lets `scripts/cms-flow.ts` exercise publishing without a browser.
 *
 * In Phase E the context parameter disappears and these become queries and
 * mutations against `cms_documents` / `cms_revisions` / `cms_audit`. Every
 * signature is already shaped for it.
 */
import type { Metadata } from "next";
import { defaultLocale, locales, type Locale } from "@/config/i18n/config";
import type {
  Category,
  BlogPost,
  CmsAuditAction,
  CmsAuditEntry,
  CmsBanner,
  CmsBannerPlacement,
  CmsCollectionDef,
  CmsCollectionId,
  CmsContactContent,
  CmsContactMessage,
  CmsContactTopic,
  CmsDocument,
  CmsDocumentView,
  CmsFieldError,
  CmsMenuItem,
  CmsRevision,
  CmsSeo,
  CmsSite,
  CmsStatus,
  CmsValues,
  FaqGroup,
  LegalDoc,
  SupportChannel,
} from "@/types";
import { buildCmsDocuments, cmsCollectionById, cmsCollections } from "@/lib/mock/cms";
import {
  applyPatch,
  coverageOf,
  faqSurfaceOf,
  isLive,
  statusOf,
  titleOf,
  toBanner,
  toBlogPost,
  toCategory,
  toContactContent,
  toFaqGroup,
  toLegalDoc,
  toMenuItems,
  toSeo,
  toSite,
  toSupportChannels,
  translationGaps,
  validateValues,
  validateWindow,
  type CmsDocPatch,
  type CmsReadOptions,
} from "@/lib/cms";
import { slugify } from "@/lib/utils";
import { mockDelay, ok, type Result } from "./http";

/** What the device holds. Empty is legal — that is a fresh browser. */
export interface CmsContext {
  patches: Record<string, CmsDocPatch>;
  /** Documents an editor created here; they exist in no seed. */
  created: CmsDocument[];
  revisions: Record<string, CmsRevision[]>;
  audit: CmsAuditEntry[];
}

export const emptyCmsContext: CmsContext = { patches: {}, created: [], revisions: {}, audit: [] };

/** The write a mutation asks the store to commit. Nothing else may write. */
export interface CmsMutation {
  documentId: string;
  action: CmsAuditAction;
  /** Field changes for a seeded document. */
  patch?: CmsDocPatch;
  /** The whole document, for one the editor created here. */
  document?: CmsDocument;
  /** A snapshot taken because published values were about to change. */
  revision?: CmsRevision;
  audit: CmsAuditEntry;
}

interface WriteMeta {
  by: string;
  at: string;
}

// ---------------------------------------------------------------------------
// Assembling the store
// ---------------------------------------------------------------------------

function bySort(a: CmsDocument, b: CmsDocument): number {
  return a.sort - b.sort || a.key.localeCompare(b.key);
}

/** Every document, seed merged with the device's edits. */
export function allDocuments(ctx: CmsContext, now = Date.now()): CmsDocument[] {
  const seeded = buildCmsDocuments(now).map((doc) => applyPatch(doc, ctx.patches[doc.id]));
  const created = ctx.created.map((doc) => applyPatch(doc, ctx.patches[doc.id]));
  return [...seeded, ...created].sort(bySort);
}

function documentsIn(collection: CmsCollectionId, ctx: CmsContext, now: number): CmsDocument[] {
  return allDocuments(ctx, now).filter((doc) => doc.collection === collection);
}

function findDocument(id: string, ctx: CmsContext, now: number): CmsDocument | null {
  return allDocuments(ctx, now).find((doc) => doc.id === id) ?? null;
}

function defOf(collection: CmsCollectionId): CmsCollectionDef {
  const def = cmsCollectionById.get(collection);
  if (!def) throw new Error(`unknown cms collection: ${collection}`);
  return def;
}

function isSeeded(doc: CmsDocument, ctx: CmsContext): boolean {
  return !ctx.created.some((created) => created.id === doc.id);
}

function viewOf(doc: CmsDocument, now: number): CmsDocumentView {
  const def = defOf(doc.collection);
  const editing = doc.draft ?? doc.values;
  return {
    document: doc,
    status: statusOf(doc, now),
    hasDraft: doc.draft !== null,
    coverage: coverageOf(def, doc, editing),
    editing,
  };
}

/** Live documents of a collection, in order — what the public site may render. */
function liveDocuments(collection: CmsCollectionId, ctx: CmsContext, now: number): CmsDocument[] {
  return documentsIn(collection, ctx, now).filter((doc) => isLive(doc, now));
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

export interface CmsCollectionSummary {
  def: CmsCollectionDef;
  total: number;
  /** Live right now. */
  published: number;
  drafts: number;
  scheduled: number;
  archived: number;
  /** Locales with at least one unauthored string across the collection. */
  gaps: Locale[];
  updatedAt: string | null;
}

export async function getCollections(ctx: CmsContext): Promise<CmsCollectionSummary[]> {
  const now = Date.now();
  const docs = allDocuments(ctx, now);

  const summaries = cmsCollections.map((def) => {
    const mine = docs.filter((doc) => doc.collection === def.id);
    const statuses = mine.map((doc) => statusOf(doc, now));
    const gaps = new Set<Locale>();

    for (const doc of mine) {
      if (doc.archivedAt) continue;
      for (const locale of translationGaps(coverageOf(def, doc, doc.draft ?? doc.values))) {
        gaps.add(locale);
      }
    }

    const updatedAt = mine.reduce<string | null>(
      (latest, doc) => (!latest || Date.parse(doc.updatedAt) > Date.parse(latest) ? doc.updatedAt : latest),
      null,
    );

    return {
      def,
      total: mine.filter((doc) => !doc.archivedAt).length,
      published: statuses.filter((s) => s === "published").length,
      drafts: mine.filter((doc) => doc.draft !== null || statusOf(doc, now) === "draft").length,
      scheduled: statuses.filter((s) => s === "scheduled").length,
      archived: statuses.filter((s) => s === "archived").length,
      gaps: locales.filter((locale) => gaps.has(locale)),
      updatedAt,
    };
  });

  return mockDelay(summaries, 120);
}

export interface CmsListQuery {
  status?: CmsStatus | null;
  search?: string;
}

export async function listDocuments(
  collection: CmsCollectionId,
  ctx: CmsContext,
  query: CmsListQuery = {},
): Promise<CmsDocumentView[]> {
  const now = Date.now();
  const def = defOf(collection);
  let views = documentsIn(collection, ctx, now).map((doc) => viewOf(doc, now));

  if (query.status) views = views.filter((view) => view.status === query.status);
  if (query.search) {
    const q = query.search.trim().toLowerCase();
    views = views.filter((view) => {
      const title = titleOf(def, view.document, view.editing).toLowerCase();
      return title.includes(q) || view.document.key.toLowerCase().includes(q);
    });
  }

  return mockDelay(views, 120);
}

export async function getDocument(id: string, ctx: CmsContext): Promise<CmsDocumentView | null> {
  const now = Date.now();
  const doc = findDocument(id, ctx, now);
  return mockDelay(doc ? viewOf(doc, now) : null, 120);
}

export async function getRevisions(id: string, ctx: CmsContext): Promise<CmsRevision[]> {
  const list = [...(ctx.revisions[id] ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return mockDelay(list, 80);
}

/** The audit trail, newest first (spec: Admin Panel — Audit Logs). */
export async function getAuditLog(ctx: CmsContext, limit = 40): Promise<CmsAuditEntry[]> {
  const list = [...ctx.audit].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
  return mockDelay(list, 80);
}

/** Documents with an unpublished draft — the admin's "waiting on you" list. */
export async function getPendingDrafts(ctx: CmsContext): Promise<CmsDocumentView[]> {
  const now = Date.now();
  const pending = allDocuments(ctx, now)
    .filter((doc) => !doc.archivedAt && (doc.draft !== null || !doc.publishedAt))
    .map((doc) => viewOf(doc, now));
  return mockDelay(pending, 120);
}

// ---------------------------------------------------------------------------
// Public reads — a document, as the surface's own type
// ---------------------------------------------------------------------------

/** Banners in a placement, in order. Scheduled and expired ones are excluded. */
export async function getBanners(
  placement: CmsBannerPlacement,
  ctx: CmsContext = emptyCmsContext,
  options: CmsReadOptions = {},
): Promise<CmsBanner[]> {
  const now = Date.now();
  const banners = liveDocuments("banners", ctx, now)
    .map((doc) => toBanner(doc, options))
    .filter((banner) => banner.placement === placement);
  return mockDelay(banners, 80);
}

export async function getMenu(
  key: "header" | "footer",
  ctx: CmsContext = emptyCmsContext,
  options: CmsReadOptions = {},
): Promise<CmsMenuItem[]> {
  const now = Date.now();
  const doc = liveDocuments("menus", ctx, now).find((d) => d.key === key);
  return mockDelay(doc ? toMenuItems(doc, options) : [], 80);
}

export async function getSiteContent(
  ctx: CmsContext = emptyCmsContext,
  options: CmsReadOptions = {},
): Promise<CmsSite | null> {
  const now = Date.now();
  const doc = liveDocuments("site", ctx, now)[0];
  return mockDelay(doc ? toSite(doc, options) : null, 80);
}

/** Per-route metadata; `null` when a route has no record (the page's own copy wins). */
export async function getSeoFor(
  route: string,
  ctx: CmsContext = emptyCmsContext,
  options: CmsReadOptions = {},
): Promise<CmsSeo | null> {
  const now = Date.now();
  const doc = liveDocuments("seo", ctx, now)
    .map((d) => ({ doc: d, seo: toSeo(d, options) }))
    .find((entry) => entry.seo.route === route);
  return mockDelay(doc ? doc.seo : null, 60);
}

/**
 * A route's `<head>`, from its SEO document (spec: CMS — SEO Metadata).
 *
 * This one is resolved **server-side, from the published seed**, and that is a
 * deliberate limit rather than an oversight: metadata is rendered before any
 * browser storage exists, so a device-local draft cannot change what a crawler
 * sees. The admin's SEO editor says so beside the fields.
 */
export async function getRouteMetadata(
  route: string,
  options: CmsReadOptions,
  fallback: { title: string; description: string },
): Promise<Metadata> {
  const seo = await getSeoFor(route, emptyCmsContext, options);
  const title = seo?.title || fallback.title;
  const description = seo?.description || fallback.description;

  return {
    title,
    description,
    alternates: { canonical: route },
    ...(seo?.ogImage
      ? { openGraph: { title, description, images: [{ url: seo.ogImage, alt: title }] } }
      : {}),
    ...(seo?.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

export async function getFaqGroupsFor(
  surface: "help" | "partner" | "rider",
  ctx: CmsContext = emptyCmsContext,
  options: CmsReadOptions = {},
): Promise<FaqGroup[]> {
  const now = Date.now();
  const groups = liveDocuments("faqs", ctx, now)
    .filter((doc) => faqSurfaceOf(doc) === surface)
    .map((doc) => toFaqGroup(doc, options));
  return mockDelay(groups, 80);
}

export async function getLegalDocument(
  slug: string,
  ctx: CmsContext = emptyCmsContext,
  options: CmsReadOptions = {},
): Promise<LegalDoc | null> {
  const now = Date.now();
  const doc = liveDocuments("legal", ctx, now).find((d) => d.key === slug);
  return mockDelay(doc ? toLegalDoc(doc, options) : null, 80);
}

/** Legal slugs for `generateStaticParams` / the sitemap — build-time, no context. */
export function getLegalSlugs(): string[] {
  return buildCmsDocuments(Date.now())
    .filter((doc) => doc.collection === "legal")
    .map((doc) => doc.key);
}

export async function getContactContent(
  ctx: CmsContext = emptyCmsContext,
  options: CmsReadOptions = {},
): Promise<CmsContactContent | null> {
  const now = Date.now();
  const doc = liveDocuments("pages", ctx, now).find((d) => d.key === "contact");
  return mockDelay(doc ? toContactContent(doc, options) : null, 80);
}

/** The document behind a marketing page — `services/pages.ts` projects it. */
export function pageDocument(
  key: string,
  ctx: CmsContext = emptyCmsContext,
  now = Date.now(),
): CmsDocument | null {
  return liveDocuments("pages", ctx, now).find((doc) => doc.key === key) ?? null;
}

export async function getSupportChannels(
  ctx: CmsContext = emptyCmsContext,
  options: CmsReadOptions = {},
): Promise<SupportChannel[]> {
  const doc = pageDocument("help", ctx);
  return mockDelay(doc ? toSupportChannels(doc, options) : [], 80);
}

export function cmsCategories(ctx: CmsContext = emptyCmsContext, options: CmsReadOptions = {}): Category[] {
  const now = Date.now();
  return liveDocuments("categories", ctx, now).map((doc) => toCategory(doc, options));
}

export function cmsPosts(ctx: CmsContext = emptyCmsContext, options: CmsReadOptions = {}): BlogPost[] {
  const now = Date.now();
  return liveDocuments("posts", ctx, now)
    .map((doc) => toBlogPost(doc, options))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

let sequence = 0;
function nextId(prefix: string, at: string): string {
  sequence += 1;
  return `${prefix}_${Date.parse(at).toString(36)}_${sequence.toString(36)}`;
}

function auditEntry(
  doc: CmsDocument,
  action: CmsAuditAction,
  values: CmsValues,
  meta: WriteMeta,
): CmsAuditEntry {
  return {
    id: nextId("aud", meta.at),
    documentId: doc.id,
    collection: doc.collection,
    title: titleOf(defOf(doc.collection), doc, values),
    action,
    at: meta.at,
    by: meta.by,
  };
}

/** Collections whose handle follows a field, so the URL matches the content. */
const KEY_FIELD: Partial<Record<CmsCollectionId, string>> = {
  posts: "slug",
  categories: "slug",
  seo: "route",
};

function deriveKey(doc: CmsDocument, values: CmsValues): string {
  const field = KEY_FIELD[doc.collection];
  if (!field) return doc.key;
  const raw = values[field];
  const text = typeof raw === "string" ? raw : "";
  const candidate = slugify(text.replace(/^\//, "")) || doc.key;
  return candidate;
}

function duplicateKey(doc: CmsDocument, key: string, ctx: CmsContext, now: number): boolean {
  return allDocuments(ctx, now).some(
    (other) => other.id !== doc.id && other.collection === doc.collection && other.key === key,
  );
}

function fail<T>(error: string): Result<T> {
  return { data: null, error };
}

export interface CmsSaveRequest {
  documentId: string;
  values: CmsValues;
  /** Publish straight away instead of leaving the change as a draft. */
  publish?: boolean;
  publishAt?: string | null;
  unpublishAt?: string | null;
  by: string;
}

export interface CmsSaveResult {
  /** `null` when the save was refused — `errors` says why, field by field. */
  mutation: CmsMutation | null;
  errors: CmsFieldError[];
}

/**
 * Save a document — as a draft by default, published when asked.
 *
 * Publishing snapshots the values it replaces into a revision first, which is
 * what makes `revertDocument` possible without a server: the history is the
 * device's, and it is complete because nothing else may write published values.
 */
export async function saveDocument(
  request: CmsSaveRequest,
  ctx: CmsContext,
): Promise<Result<CmsSaveResult>> {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const meta: WriteMeta = { by: request.by, at };

  const doc = findDocument(request.documentId, ctx, now);
  if (!doc) return mockDelay(fail("cms.errors.notFound"), 150);
  if (doc.archivedAt) return mockDelay(fail("cms.errors.archived"), 150);

  const def = defOf(doc.collection);
  const errors = [
    ...validateValues(def, doc, request.values),
    ...validateWindow(request.publishAt ?? doc.publishAt, request.unpublishAt ?? doc.unpublishAt),
  ];
  // Refusing with the field errors rather than a bare message is what lets the
  // editor mark the offending fields even when the guard, not the form, caught it.
  if (errors.length > 0) return mockDelay(ok({ mutation: null, errors }), 150);

  const key = deriveKey(doc, request.values);
  if (duplicateKey(doc, key, ctx, now)) return mockDelay(fail("cms.errors.duplicateKey"), 150);

  const seeded = isSeeded(doc, ctx);
  const publishing = Boolean(request.publish);

  const patch: CmsDocPatch = {
    updatedAt: at,
    updatedBy: request.by,
    publishAt: request.publishAt ?? doc.publishAt,
    unpublishAt: request.unpublishAt ?? doc.unpublishAt,
  };

  let revision: CmsRevision | undefined;

  if (publishing) {
    patch.values = request.values;
    patch.draft = null;
    patch.publishedAt = doc.publishedAt ?? at;
    if (doc.publishedAt) {
      revision = {
        id: nextId("rev", at),
        documentId: doc.id,
        values: doc.values,
        at,
        by: request.by,
        reason: "publish",
      };
    }
  } else {
    patch.draft = request.values;
  }

  const next: CmsDocument = { ...applyPatch(doc, patch), key };
  const mutation: CmsMutation = {
    documentId: doc.id,
    action: publishing ? "published" : "saved",
    patch: seeded ? { ...patch } : undefined,
    document: seeded ? undefined : next,
    revision,
    audit: auditEntry(next, publishing ? "published" : "saved", request.values, meta),
  };

  return mockDelay(ok({ mutation, errors: [] }), 250);
}

/** Publish whatever draft is open, unchanged. */
export async function publishDocument(
  documentId: string,
  ctx: CmsContext,
  by: string,
): Promise<Result<CmsSaveResult>> {
  const doc = findDocument(documentId, ctx, Date.now());
  if (!doc) return mockDelay(fail("cms.errors.notFound"), 150);
  if (!doc.draft && doc.publishedAt) return mockDelay(fail("cms.errors.nothingToPublish"), 150);

  return saveDocument(
    {
      documentId,
      values: doc.draft ?? doc.values,
      publish: true,
      by,
    },
    ctx,
  );
}

/** Take a document off the site without losing it. */
export async function unpublishDocument(
  documentId: string,
  ctx: CmsContext,
  by: string,
): Promise<Result<CmsMutation>> {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const doc = findDocument(documentId, ctx, now);
  if (!doc) return mockDelay(fail("cms.errors.notFound"), 150);
  if (doc.locked) return mockDelay(fail("cms.errors.locked"), 150);
  if (!isLive(doc, now)) return mockDelay(fail("cms.errors.notLive"), 150);

  const patch: CmsDocPatch = { unpublishAt: at, updatedAt: at, updatedBy: by };
  const seeded = isSeeded(doc, ctx);

  return mockDelay(
    ok({
      documentId,
      action: "unpublished",
      patch: seeded ? patch : undefined,
      document: seeded ? undefined : applyPatch(doc, patch),
      audit: auditEntry(doc, "unpublished", doc.values, { by, at }),
    }),
    200,
  );
}

/** Throw away an open draft; published values are untouched. */
export async function discardDraft(
  documentId: string,
  ctx: CmsContext,
  by: string,
): Promise<Result<CmsMutation>> {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const doc = findDocument(documentId, ctx, now);
  if (!doc) return mockDelay(fail("cms.errors.notFound"), 150);
  if (!doc.draft) return mockDelay(fail("cms.errors.noDraft"), 150);

  const patch: CmsDocPatch = { draft: null, updatedAt: at, updatedBy: by };
  const seeded = isSeeded(doc, ctx);

  return mockDelay(
    ok({
      documentId,
      action: "discarded",
      patch: seeded ? patch : undefined,
      document: seeded ? undefined : applyPatch(doc, patch),
      audit: auditEntry(doc, "discarded", doc.values, { by, at }),
    }),
    200,
  );
}

/** Put an earlier revision back on the site, keeping the current one in history. */
export async function revertDocument(
  documentId: string,
  revisionId: string,
  ctx: CmsContext,
  by: string,
): Promise<Result<CmsMutation>> {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const doc = findDocument(documentId, ctx, now);
  if (!doc) return mockDelay(fail("cms.errors.notFound"), 150);

  const revision = (ctx.revisions[documentId] ?? []).find((r) => r.id === revisionId);
  if (!revision) return mockDelay(fail("cms.errors.noRevision"), 150);

  const patch: CmsDocPatch = {
    values: revision.values,
    draft: null,
    updatedAt: at,
    updatedBy: by,
  };
  const seeded = isSeeded(doc, ctx);

  return mockDelay(
    ok({
      documentId,
      action: "reverted",
      patch: seeded ? patch : undefined,
      document: seeded ? undefined : applyPatch(doc, patch),
      revision: {
        id: nextId("rev", at),
        documentId,
        values: doc.values,
        at,
        by,
        reason: "revert",
      },
      audit: auditEntry(doc, "reverted", revision.values, { by, at }),
    }),
    250,
  );
}

/** A new, empty document in a creatable collection. */
export async function createDocument(
  collection: CmsCollectionId,
  ctx: CmsContext,
  by: string,
): Promise<Result<CmsMutation>> {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const def = defOf(collection);
  if (!def.creatable) return mockDelay(fail("cms.errors.notCreatable"), 150);

  const existing = documentsIn(collection, ctx, now);
  const nth = existing.length + 1;
  const key = `untitled-${nth}`;

  const document: CmsDocument = {
    id: nextId(`cms_${collection}`, at),
    collection,
    key,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    values: {},
    draft: {},
    sort: (existing.at(-1)?.sort ?? 0) + 1,
    publishAt: null,
    unpublishAt: null,
    publishedAt: null,
    archivedAt: null,
    updatedBy: by,
  };

  return mockDelay(
    ok({
      documentId: document.id,
      action: "created",
      document,
      audit: auditEntry(document, "created", {}, { by, at }),
    }),
    200,
  );
}

/** Archive (soft-delete) or restore a document. */
export async function setArchived(
  documentId: string,
  archived: boolean,
  ctx: CmsContext,
  by: string,
): Promise<Result<CmsMutation>> {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const doc = findDocument(documentId, ctx, now);
  if (!doc) return mockDelay(fail("cms.errors.notFound"), 150);
  if (doc.locked) return mockDelay(fail("cms.errors.locked"), 150);

  const patch: CmsDocPatch = { archivedAt: archived ? at : null, updatedAt: at, updatedBy: by };
  const seeded = isSeeded(doc, ctx);

  return mockDelay(
    ok({
      documentId,
      action: archived ? "archived" : "restored",
      patch: seeded ? patch : undefined,
      document: seeded ? undefined : applyPatch(doc, patch),
      audit: auditEntry(doc, archived ? "archived" : "restored", doc.values, { by, at }),
    }),
    200,
  );
}

/**
 * Move a document one place up or down inside its collection.
 *
 * Reordering swaps the two neighbours' weights rather than renumbering the
 * collection, so one drag is one changed row — the UPDATE a backend would run.
 */
export async function moveDocument(
  documentId: string,
  direction: "up" | "down",
  ctx: CmsContext,
  by: string,
): Promise<Result<CmsMutation[]>> {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const doc = findDocument(documentId, ctx, now);
  if (!doc) return mockDelay(fail("cms.errors.notFound"), 150);

  const def = defOf(doc.collection);
  if (!def.orderable) return mockDelay(fail("cms.errors.notOrderable"), 150);

  const siblings = documentsIn(doc.collection, ctx, now).filter((d) => !d.archivedAt);
  const index = siblings.findIndex((d) => d.id === documentId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  const target = siblings[targetIndex];
  if (!target) return mockDelay(fail("cms.errors.cannotMove"), 150);

  const mutate = (subject: CmsDocument, sort: number): CmsMutation => {
    const patch: CmsDocPatch = { sort, updatedAt: at, updatedBy: by };
    const seeded = isSeeded(subject, ctx);
    return {
      documentId: subject.id,
      action: "reordered",
      patch: seeded ? patch : undefined,
      document: seeded ? undefined : applyPatch(subject, patch),
      audit: auditEntry(subject, "reordered", subject.values, { by, at }),
    };
  };

  // A plain swap, except when the two weights are already equal — then the key
  // tiebreak decides the order and swapping would change nothing.
  const tie = doc.sort === target.sort;
  const mine = tie ? doc.sort + (direction === "up" ? -1 : 1) : target.sort;
  const theirs = tie ? target.sort : doc.sort;

  return mockDelay(ok([mutate(doc, mine), mutate(target, theirs)]), 200);
}

// ---------------------------------------------------------------------------
// The contact form
// ---------------------------------------------------------------------------

const CONTACT_TOPICS: readonly CmsContactTopic[] = ["order", "partner", "rider", "press", "other"];
export const CONTACT_MESSAGE_LIMIT = 1200;

export interface ContactInput {
  name: string;
  email: string;
  topic: string;
  message: string;
}

/**
 * Send a message from `/contact`. Nothing is emailed — the prototype has no
 * mail provider and says so on the page — but the rules are real, and they live
 * here rather than in the form: a message that fails them is refused with an
 * i18n key whichever surface submits it.
 */
export async function submitContactMessage(input: ContactInput): Promise<Result<CmsContactMessage>> {
  const at = new Date().toISOString();
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();

  if (name.length < 2) return mockDelay(fail("cms.contact.errors.name"), 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return mockDelay(fail("cms.contact.errors.email"), 200);
  if (!CONTACT_TOPICS.includes(input.topic as CmsContactTopic)) {
    return mockDelay(fail("cms.contact.errors.topic"), 200);
  }
  if (message.length < 20) return mockDelay(fail("cms.contact.errors.short"), 200);
  if (message.length > CONTACT_MESSAGE_LIMIT) return mockDelay(fail("cms.contact.errors.long"), 200);

  return mockDelay(
    ok({
      id: nextId("msg", at),
      name,
      email,
      topic: input.topic as CmsContactTopic,
      message,
      at,
    }),
    400,
  );
}

// ---------------------------------------------------------------------------
// Read options
// ---------------------------------------------------------------------------

/** Convenience for callers that only know the locale. */
export function readOptions(locale: string | undefined, translate?: (key: string) => string): CmsReadOptions {
  const resolved = (locales as readonly string[]).includes(locale ?? "") ? (locale as Locale) : defaultLocale;
  return { locale: resolved, translate };
}
