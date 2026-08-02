/**
 * C26 flow check — exercises the CMS end to end. Run from the project root:
 *
 *     NODE_ENV=test bun scripts/cms-flow.ts
 *
 * Every assertion is a claim the phase makes in prose somewhere; this is where
 * those claims are checked against the code rather than against confidence. The
 * three that matter most are text resolution (an override must not untranslate
 * the other locales), the publish/draft split (the site keeps serving the
 * published values until someone presses publish) and key coverage (every
 * message the seam or the editor can emit has to exist in all three catalogs).
 */
import { readFileSync } from "node:fs";

import type {
  CmsAuditEntry,
  CmsDocument,
  CmsRevision,
  CmsRow,
  CmsValues,
} from "@/frontend/types";
import { locales, type Locale } from "@/frontend/config/i18n/config";
import { buildCmsDocuments, cmsCollections, cmsCollectionById } from "@/frontend/lib/mock/cms";
import {
  applyPatch,
  coverageOf,
  fieldsOf,
  isLive,
  liveReader,
  resolveText,
  splitLines,
  splitParagraphs,
  statusOf,
  titleOf,
  toBanner,
  toBlogPost,
  toCategory,
  toFaqGroup,
  toLegalDoc,
  toMenuItems,
  toSeo,
  toSite,
  translationGaps,
  validateValues,
  validateWindow,
  type CmsDocPatch,
} from "@/frontend/lib/cms";
import {
  allDocuments,
  createDocument,
  discardDraft,
  emptyCmsContext,
  getBanners,
  getCollections,
  getContactContent,
  getFaqGroupsFor,
  getLegalDocument,
  getMenu,
  getPendingDrafts,
  getRevisions,
  getSeoFor,
  getSiteContent,
  publishDocument,
  revertDocument,
  saveDocument,
  setArchived,
  submitContactMessage,
  unpublishDocument,
  type CmsContext,
  type CmsMutation,
} from "@/frontend/services/cms";
import { getAboutContent, getCareersContent, getHelpContent, getPartnerContent } from "@/frontend/services/pages";
import { getBlogPosts, getBlogCategories } from "@/frontend/services/content";
import { getCategories } from "@/frontend/services/catalog";
import { contactMessageNotification } from "@/frontend/lib/notifications";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = "") {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const NOW = Date.now();
const seed = buildCmsDocuments(NOW);

/** A tiny in-memory stand-in for `stores/cms.commit`. */
function makeStore(): {
  ctx: CmsContext;
  commit: (mutation: CmsMutation | CmsMutation[]) => void;
} {
  const ctx: CmsContext = { patches: {}, created: [], revisions: {}, audit: [] };

  function commit(mutation: CmsMutation | CmsMutation[]) {
    for (const m of Array.isArray(mutation) ? mutation : [mutation]) {
      if (m.patch) ctx.patches[m.documentId] = { ...ctx.patches[m.documentId], ...m.patch };
      if (m.document) {
        const index = ctx.created.findIndex((doc) => doc.id === m.document!.id);
        if (index === -1) ctx.created.push(m.document);
        else ctx.created[index] = m.document;
      }
      if (m.revision) {
        ctx.revisions[m.documentId] = [m.revision, ...(ctx.revisions[m.documentId] ?? [])];
      }
      ctx.audit.unshift(m.audit);
    }
  }

  return { ctx, commit };
}

function doc(key: string, collection?: CmsDocument["collection"]): CmsDocument {
  // Handles are unique per collection, not globally — `contact` is both a page
  // and an SEO record, which is exactly the ambiguity a real query would face.
  const found = seed.find((d) => d.key === key && (!collection || d.collection === collection));
  if (!found) throw new Error(`no seeded document: ${key}`);
  return found;
}

const en = (text: string) => ({ en: text });

// ── 1. The seed ──────────────────────────────────────────────────────────────

console.log("\n1. The seed");
{
  check("every collection is declared", cmsCollections.length === 9, `${cmsCollections.length}`);
  check("the seed is substantial", seed.length > 40, `${seed.length} documents`);

  const ids = new Set(seed.map((d) => d.id));
  check("document ids are unique", ids.size === seed.length);

  for (const collection of cmsCollections) {
    const mine = seed.filter((d) => d.collection === collection.id);
    check(`${collection.id} has documents`, mine.length > 0);
    const keys = new Set(mine.map((d) => d.key));
    check(`${collection.id} keys are unique`, keys.size === mine.length);
  }

  // Every field an editor can see must have a schema entry, and every repeater
  // row's sub-fields must be scalars — the editor has no nested repeater.
  let nested = 0;
  for (const document of seed) {
    for (const field of fieldsOf(cmsCollectionById.get(document.collection)!, document)) {
      for (const sub of field.fields ?? []) if (sub.type === "repeater") nested++;
    }
  }
  check("no repeater nests another", nested === 0, `${nested}`);

  // The seed never reads the clock: windows are offsets stamped by the builder.
  const later = buildCmsDocuments(NOW + 5 * 24 * 60 * 60 * 1000);
  const festival = later.find((d) => d.key === "home-festival")!;
  check(
    "windows are relative to `now`",
    Date.parse(festival.publishAt!) - (NOW + 5 * 24 * 60 * 60 * 1000) > 0,
  );

  check("the seed is published", seed.every((d) => d.publishedAt !== null));
  check("the seed has no open drafts", seed.every((d) => d.draft === null));
}

// ── 2. Text resolution ───────────────────────────────────────────────────────

console.log("2. Text resolution");
{
  const translate = (key: string) => (key === "home.heroTitle" ? "কী খেতে চান" : key);

  // No authored value: the catalog's translation wins.
  check(
    "an unauthored field reads its message key",
    resolveText(undefined, { locale: "bn", translate }, "home.heroTitle") === "কী খেতে চান",
  );

  // Authored in the locale being read: the override wins.
  check(
    "an authored locale wins over the key",
    resolveText({ bn: "নতুন" }, { locale: "bn", translate }, "home.heroTitle") === "নতুন",
  );

  // Authored in English only: Bangla keeps its translation. This is the rule
  // that lets the CMS take over catalog copy without untranslating the site.
  check(
    "an English override does not untranslate Bangla",
    resolveText({ en: "New headline" }, { locale: "bn", translate }, "home.heroTitle") ===
      "কী খেতে চান",
  );

  // No key at all: fall back to the default locale rather than to nothing.
  check(
    "without a key it falls back to English",
    resolveText({ en: "Only English" }, { locale: "ar" }) === "Only English",
  );

  check("a missing key is not content", resolveText(undefined, { locale: "en", translate }, "nope.missing") === "");

  check(
    "paragraphs split on blank lines",
    splitParagraphs("one\nstill one\n\ntwo").length === 2,
  );
  check("bullets split per line", splitLines("a\nb\n\nc").length === 3);
}

// ── 3. Projections ───────────────────────────────────────────────────────────

console.log("3. Projections");
{
  const hero = toBanner(doc("home-hero"), { locale: "en", translate: (k) => `T:${k}` });
  check("the hero resolves its placement", hero.placement === "home-hero");
  check("the hero's title comes from the catalog", hero.title === "T:home.heroTitle");

  const legal = toLegalDoc(doc("terms"), { locale: "en" });
  check("a legal doc keeps its sections", legal.sections.length >= 5, `${legal.sections.length}`);
  check("sections carry paragraphs", legal.sections[0].paragraphs.length >= 2);
  check(
    "a bulleted section keeps its bullets",
    legal.sections.some((s) => (s.bullets?.length ?? 0) > 0),
  );

  const refund = toLegalDoc(doc("refund"), { locale: "en" });
  check("the refund policy is real content", refund.sections.length === 5, `${refund.sections.length}`);

  const post = toBlogPost(doc(seed.find((d) => d.collection === "posts")!.key), { locale: "en" });
  check("a post keeps its body", post.body.length > 3, `${post.body.length}`);
  check("a post keeps its tags", post.tags.length > 0);
  check(
    "list blocks become item arrays",
    seed
      .filter((d) => d.collection === "posts")
      .map((d) => toBlogPost(d, { locale: "en" }))
      .some((p) => p.body.some((b) => b.type === "list" && b.items.length > 1)),
  );

  const faq = toFaqGroup(doc("orders"), { locale: "en" });
  check("a FAQ group keeps its questions", faq.items.length > 2, `${faq.items.length}`);

  const category = toCategory(doc("pizza"), { locale: "en" });
  check("a category keeps its keywords", category.keywords.includes("pizza"));

  const header = toMenuItems(doc("header"), { locale: "en", translate: (k) => `T:${k}` });
  check("the header menu resolves labels from keys", header[0].label === "T:nav.restaurants");
  check("the header menu carries icons", header.every((item) => item.icon.length > 0));

  const footer = toMenuItems(doc("footer"), { locale: "en", translate: (k) => k });
  check("the footer has three groups", new Set(footer.map((i) => i.group)).size === 3);
  check("the footer links to /refund", footer.some((i) => i.href === "/refund"));
  check("the footer links to /contact", footer.some((i) => i.href === "/contact"));

  const site = toSite(doc("site"), { locale: "en", translate: (k) => `T:${k}` });
  check("the site record has a brand", site.brandName === "FoodOra");
  check("the tagline falls back to the catalog", site.tagline === "T:common.tagline");

  const seo = toSeo(doc("contact", "seo"), { locale: "en" });
  check("an SEO record carries its route", seo.route === "/contact");

  // A hidden menu row must not reach the site.
  const hidden = applyPatch(doc("header"), {
    values: {
      items: (doc("header").values.items as CmsRow[]).map((row, i) =>
        i === 0 ? { ...row, values: { ...row.values, visible: false } } : row,
      ),
    },
  });
  check(
    "an invisible link is dropped",
    toMenuItems(hidden, { locale: "en", translate: (k) => k }).length === header.length - 1,
  );
}

// ── 4. Derived status ────────────────────────────────────────────────────────

console.log("4. Derived status");
{
  const live = doc("home-free-delivery");
  check("an open window reads published", statusOf(live, NOW) === "published");
  check("a live document is served", isLive(live, NOW));

  const scheduled = doc("home-festival");
  check("a future window reads scheduled", statusOf(scheduled, NOW) === "scheduled");
  check("a scheduled document is not served", !isLive(scheduled, NOW));
  // ...and becomes live on its own, with nothing flipping a flag.
  check(
    "it publishes itself when the day comes",
    statusOf(scheduled, Date.parse(scheduled.publishAt!) + 1) === "published",
  );

  check(
    "a closed window reads expired",
    statusOf(applyPatch(live, { unpublishAt: new Date(NOW - 1000).toISOString() }), NOW) ===
      "expired",
  );
  check(
    "an archived document reads archived",
    statusOf(applyPatch(live, { archivedAt: new Date(NOW).toISOString() }), NOW) === "archived",
  );
  check(
    "a never-published document reads draft",
    statusOf(applyPatch(live, { publishedAt: null }), NOW) === "draft",
  );
}

// ── 5. Coverage ──────────────────────────────────────────────────────────────

console.log("5. Coverage");
{
  const about = doc("about");
  const def = cmsCollectionById.get("pages")!;
  const coverage = coverageOf(def, about, about.values);
  check("English is fully authored", coverage.en === 1, `${coverage.en}`);
  check("Bangla is a gap", coverage.bn < 1, `${coverage.bn}`);
  check("gaps are reported", translationGaps(coverage).includes("bn"));

  // A key-backed field counts as covered: the catalog already has that locale.
  // So does an empty optional one — it is unused, not untranslated.
  const heroCoverage = coverageOf(cmsCollectionById.get("banners")!, doc("home-hero"));
  check(
    "a key-backed field is not a gap",
    locales.every((locale: Locale) => heroCoverage[locale] === 1),
    JSON.stringify(heroCoverage),
  );

  // An authored-in-English-only banner *is* a gap in the other two.
  const promoCoverage = coverageOf(cmsCollectionById.get("banners")!, doc("home-free-delivery"));
  check("an English-only banner is a gap", promoCoverage.bn < 1 && promoCoverage.en === 1,
    JSON.stringify(promoCoverage));
}

// ── 6. Validation ────────────────────────────────────────────────────────────

console.log("6. Validation");
{
  const def = cmsCollectionById.get("legal")!;
  const terms = doc("terms");

  check("the seed validates", validateValues(def, terms, terms.values).length === 0);

  const missingTitle: CmsValues = { ...terms.values, title: {} };
  check(
    "a required field is refused",
    validateValues(def, terms, missingTitle).some((e) => e.error === "cms.errors.required"),
  );

  const badSection: CmsValues = {
    ...terms.values,
    sections: [{ id: "r1", values: { id: "x", heading: {} } }],
  };
  check(
    "a repeater row's required field is refused",
    validateValues(def, terms, badSection).some(
      (e) => e.error === "cms.errors.required" && e.path.startsWith("sections."),
    ),
  );

  const banners = cmsCollectionById.get("banners")!;
  const hero = doc("home-hero");
  check(
    "a bad link is refused",
    validateValues(banners, hero, { ...hero.values, ctaHref: "javascript:alert(1)" }).some(
      (e) => e.error === "cms.errors.href",
    ),
  );
  check(
    "an unknown option is refused",
    validateValues(banners, hero, { ...hero.values, placement: "nowhere" }).some(
      (e) => e.error === "cms.errors.option",
    ),
  );
  check(
    "an over-long headline is refused",
    validateValues(banners, hero, { ...hero.values, title: en("x".repeat(200)) }).some(
      (e) => e.error === "cms.errors.tooLong",
    ),
  );

  const posts = cmsCollectionById.get("posts")!;
  const post = seed.find((d) => d.collection === "posts")!;
  check(
    "a bad slug is refused",
    validateValues(posts, post, { ...post.values, slug: "Not A Slug" }).some(
      (e) => e.error === "cms.errors.slug",
    ),
  );

  // The hero's title is *not* authored, and must still pass: a message key is a
  // value. Requiring text here would force an editor to paste English over three
  // working translations.
  check(
    "a key-backed required field passes",
    validateValues(banners, hero, hero.values).length === 0,
  );

  check(
    "a backwards window is refused",
    validateWindow("2026-08-10T00:00:00.000Z", "2026-08-01T00:00:00.000Z").length === 1,
  );
  check("a forwards window passes", validateWindow("2026-08-01", "2026-08-10").length === 0);
}

// ── 7. Draft, publish, revert ────────────────────────────────────────────────

console.log("7. Draft, publish, revert");
{
  const { ctx, commit } = makeStore();
  const target = doc("about");
  const edited: CmsValues = { ...target.values, lead: en("A new mission statement.") };

  // Save as a draft.
  const draft = await saveDocument({ documentId: target.id, values: edited, by: "Tester" }, ctx);
  check("a save is accepted", draft.data?.mutation !== null && draft.error === null);
  commit(draft.data!.mutation!);

  const afterDraft = allDocuments(ctx, NOW).find((d) => d.id === target.id)!;
  check("the draft is stored", afterDraft.draft !== null);
  check(
    "the site still serves the published values",
    liveReader(afterDraft, { locale: "en" }).text("lead") ===
      liveReader(target, { locale: "en" }).text("lead"),
  );
  check("the draft is listed as pending", (await getPendingDrafts(ctx)).some((v) => v.document.id === target.id));

  // Publishing it moves the draft into place and snapshots what it replaced.
  const published = await publishDocument(target.id, ctx, "Tester");
  check("publishing an open draft is accepted", published.data?.mutation != null);
  commit(published.data!.mutation!);

  const afterPublish = allDocuments(ctx, NOW).find((d) => d.id === target.id)!;
  check("the draft is cleared", afterPublish.draft === null);
  check(
    "the site now serves the edit",
    liveReader(afterPublish, { locale: "en" }).text("lead") === "A new mission statement.",
  );
  // The same edit, on a field the catalogs own: English changes, Bangla keeps its
  // translation. This is the resolution rule, end to end through the seam.
  const hero = doc("home-hero");
  const heroEdit = await saveDocument(
    { documentId: hero.id, values: { ...hero.values, title: en("Everything, delivered") }, publish: true, by: "Tester" },
    ctx,
  );
  commit(heroEdit.data!.mutation!);
  const editedHero = allDocuments(ctx, NOW).find((d) => d.id === hero.id)!;
  const translate = (key: string) => (key === "home.heroTitle" ? "প্রতিটি স্বাদ, দরজায়" : key);
  check(
    "the English hero shows the edit",
    liveReader(editedHero, { locale: "en", translate }).text("title") === "Everything, delivered",
  );
  check(
    "Bangla keeps its catalog translation",
    liveReader(editedHero, { locale: "bn", translate }).text("title") === "প্রতিটি স্বাদ, দরজায়",
  );

  const revisions: CmsRevision[] = await getRevisions(target.id, ctx);
  check("the publish left a revision", revisions.length === 1, `${revisions.length}`);
  check("the revision holds the old values", revisions[0].reason === "publish");

  // Reverting puts it back — and keeps the current version in history.
  const reverted = await revertDocument(target.id, revisions[0].id, ctx, "Tester");
  check("a revert is accepted", reverted.data != null);
  commit(reverted.data!);
  const afterRevert = allDocuments(ctx, NOW).find((d) => d.id === target.id)!;
  check(
    "the earlier version is back",
    liveReader(afterRevert, { locale: "en" }).text("lead") ===
      liveReader(target, { locale: "en" }).text("lead"),
  );
  check("the revert is itself a revision", (await getRevisions(target.id, ctx)).length === 2);

  // Nothing to publish is refused rather than silently no-oping.
  const nothing = await publishDocument(target.id, ctx, "Tester");
  check("publishing nothing is refused", nothing.error === "cms.errors.nothingToPublish");

  // A refused save reports the fields, not just a message. `terms.title` is
  // authored content with no message key behind it, so emptying it is a real
  // failure — unlike a key-backed field, which is allowed to hold no text.
  const legal = doc("terms");
  const invalid = await saveDocument(
    { documentId: legal.id, values: { ...legal.values, title: {} }, by: "Tester" },
    ctx,
  );
  check("the seam re-runs validation", invalid.data?.mutation === null);
  check("it names the offending field", (invalid.data?.errors ?? []).some((e) => e.path === "title"));

  // Discarding.
  const second = await saveDocument(
    { documentId: target.id, values: { ...target.values, lead: en("Draft two") }, by: "Tester" },
    ctx,
  );
  commit(second.data!.mutation!);
  const discarded = await discardDraft(target.id, ctx, "Tester");
  check("a draft can be discarded", discarded.data != null);
  commit(discarded.data!);
  check(
    "discarding leaves no draft",
    allDocuments(ctx, NOW).find((d) => d.id === target.id)!.draft === null,
  );
  check("discarding writes no revision", (await getRevisions(target.id, ctx)).length === 2);

  // The audit trail recorded all of it.
  const actions = ctx.audit.map((entry: CmsAuditEntry) => entry.action);
  for (const action of ["saved", "published", "reverted", "discarded"]) {
    check(`the audit log records "${action}"`, actions.includes(action as CmsAuditEntry["action"]));
  }
  check("audit entries name the editor", ctx.audit.every((e) => e.by === "Tester"));
}

// ── 8. Unpublish, archive, create, reorder ───────────────────────────────────

console.log("8. Unpublish, archive, create, reorder");
{
  const { ctx, commit } = makeStore();

  // A structural document cannot be removed.
  const lockedUnpublish = await unpublishDocument(doc("header").id, ctx, "Tester");
  check("a locked document cannot be unpublished", lockedUnpublish.error === "cms.errors.locked");
  const lockedArchive = await setArchived(doc("header").id, true, ctx, "Tester");
  check("a locked document cannot be archived", lockedArchive.error === "cms.errors.locked");

  // An ordinary one can.
  const banner = doc("home-meal-plans");
  const down = await unpublishDocument(banner.id, ctx, "Tester");
  check("unpublishing is accepted", down.data != null);
  commit(down.data!);
  const after = allDocuments(ctx, Date.now()).find((d) => d.id === banner.id)!;
  check("it leaves the site", !isLive(after, Date.now()));
  check("it is not deleted", after.values.title !== undefined);
  check(
    "the public read no longer returns it",
    !(await getBanners("home-strip", ctx)).some((b) => b.key === banner.key),
  );

  // Creating.
  const created = await createDocument("posts", ctx, "Tester");
  check("a document can be created", created.data?.document != null);
  commit(created.data!);
  const newDoc = allDocuments(ctx, NOW).find((d) => d.id === created.data!.documentId)!;
  check("a new document starts as a draft", statusOf(newDoc, NOW) === "draft");
  check("a new document is not live", !isLive(newDoc, NOW));

  const notCreatable = await createDocument("pages", ctx, "Tester");
  check("a fixed collection refuses creation", notCreatable.error === "cms.errors.notCreatable");

  // A created document's handle follows its slug, and cannot collide.
  const existingSlug = String((seed.find((d) => d.collection === "posts")!.values as CmsValues).slug);
  const collide = await saveDocument(
    {
      documentId: newDoc.id,
      values: {
        slug: existingSlug,
        title: en("Clashing"),
        category: "Guides",
        author: "Tester",
        publishedAt: "2026-07-01",
        body: [{ id: "b1", values: { type: "paragraph", text: en("Hello there, world.") } }],
      },
      by: "Tester",
    },
    ctx,
  );
  check("a duplicate handle is refused", collide.error === "cms.errors.duplicateKey");

  // Reordering swaps two neighbours rather than renumbering the collection.
  const categoriesBefore = allDocuments(ctx, NOW).filter((d) => d.collection === "categories");
  const move = await import("@/frontend/services/cms").then((m) =>
    m.moveDocument(categoriesBefore[1].id, "up", ctx, "Tester"),
  );
  check("a reorder is accepted", move.data?.length === 2);
  commit(move.data!);
  const categoriesAfter = allDocuments(ctx, NOW).filter((d) => d.collection === "categories");
  check(
    "the two neighbours swapped",
    categoriesAfter[0].id === categoriesBefore[1].id &&
      categoriesAfter[1].id === categoriesBefore[0].id,
  );

  const notOrderable = await import("@/frontend/services/cms").then((m) =>
    m.moveDocument(doc("terms").id, "up", ctx, "Tester"),
  );
  check("an unordered collection refuses a move", notOrderable.error === "cms.errors.notOrderable");
}

// ── 9. The public seam ───────────────────────────────────────────────────────

console.log("9. The public seam");
{
  const options = { locale: "en" as const, translate: (k: string) => `T:${k}` };

  const heroes = await getBanners("home-hero", emptyCmsContext, options);
  check("the hero banner is served", heroes.length === 1);

  const strip = await getBanners("home-strip", emptyCmsContext, options);
  check("only live promos are served", strip.length === 2, `${strip.length}`);
  check("the scheduled promo is withheld", !strip.some((b) => b.key === "home-festival"));

  check("the header menu is served", (await getMenu("header", emptyCmsContext, options)).length === 9);
  check("the footer menu is served", (await getMenu("footer", emptyCmsContext, options)).length === 9);
  check("the site record is served", (await getSiteContent(emptyCmsContext, options))?.brandName === "FoodOra");

  check("terms resolves", (await getLegalDocument("terms", emptyCmsContext, options))?.slug === "terms");
  check("refund resolves", (await getLegalDocument("refund", emptyCmsContext, options))?.slug === "refund");
  check("an unknown legal slug is null", (await getLegalDocument("nope", emptyCmsContext, options)) === null);

  const helpFaqs = await getFaqGroupsFor("help", emptyCmsContext, options);
  const partnerFaqs = await getFaqGroupsFor("partner", emptyCmsContext, options);
  check("help FAQs are scoped to help", helpFaqs.length === 4, `${helpFaqs.length}`);
  check("partner FAQs are scoped to partner", partnerFaqs.length === 2, `${partnerFaqs.length}`);
  check(
    "the two sets are disjoint",
    !helpFaqs.some((group) => partnerFaqs.some((other) => other.id === group.id)),
  );

  const seo = await getSeoFor("/about", emptyCmsContext, options);
  check("an SEO record resolves for a route", seo !== null);
  check("its title falls back to the catalog", seo?.title === "T:about.metaTitle");
  check("an unmanaged route has no record", (await getSeoFor("/nowhere", emptyCmsContext, options)) === null);

  const contact = await getContactContent(emptyCmsContext, options);
  check("the contact page has channels", (contact?.channels.length ?? 0) === 4);
  check("the contact page has offices", (contact?.offices.length ?? 0) === 3);

  const summaries = await getCollections(emptyCmsContext);
  check("every collection is summarised", summaries.length === 9);
  check("nothing is pending on a fresh device", summaries.every((s) => s.drafts === 0));
}

// ── 10. The pages the CMS now feeds ──────────────────────────────────────────

console.log("10. The pages the CMS now feeds");
{
  const options = { locale: "en", translate: (k: string) => `T:${k}` };

  const about = await getAboutContent(options);
  check("about keeps its story", about.story.length >= 3, `${about.story.length}`);
  check("about keeps its stats", about.stats.length === 4, `${about.stats.length}`);
  check("about keeps its values", about.values.length === 4, `${about.values.length}`);
  check("about keeps its timeline", about.timeline.length >= 5, `${about.timeline.length}`);
  check("about's eyebrow comes from the catalog", about.hero.eyebrow === "T:about.eyebrow");
  check("about's lead is authored content", about.hero.lead.length > 40);

  const careers = await getCareersContent(options);
  check("careers keeps its roles", careers.jobs.length === 7, `${careers.jobs.length}`);
  check("a role keeps its team", careers.jobs.every((job) => job.team.length > 0));

  const help = await getHelpContent(options);
  check("help keeps its channels", help.channels.length === 4, `${help.channels.length}`);
  check("help keeps its FAQs", help.faqs.length === 4);

  const partner = await getPartnerContent(options);
  check("partner keeps its steps", partner.steps.length === 4, `${partner.steps.length}`);
  check("partner keeps its FAQs", partner.faqs.length === 2);

  const posts = await getBlogPosts(undefined, options);
  check("every article is served", posts.length === 9, `${posts.length}`);
  check("articles are newest first", Date.parse(posts[0].publishedAt) >= Date.parse(posts[1].publishedAt));
  check("an article keeps its body", posts.every((p) => p.body.length > 2));

  const blogCategories = await getBlogCategories(options);
  check("blog categories are counted", blogCategories.reduce((n, c) => n + c.count, 0) === posts.length);

  const categories = await getCategories(options);
  check("the craving rail is served", categories.length === 10, `${categories.length}`);
  check("categories keep their search keywords", categories.every((c) => c.keywords.length > 0));
  check("categories are ordered", categories[0].slug === "pizza");
}

// ── 11. A published edit reaches the public read ─────────────────────────────

console.log("11. A published edit reaches the public read");
{
  const { ctx, commit } = makeStore();
  const target = doc("terms");

  const values: CmsValues = { ...target.values, title: en("Terms of use") };
  const result = await saveDocument({ documentId: target.id, values, publish: true, by: "Tester" }, ctx);
  commit(result.data!.mutation!);

  const served = await getLegalDocument("terms", ctx, { locale: "en" });
  check("the public read shows the edit", served?.title === "Terms of use");

  const untouched = await getLegalDocument("privacy", ctx, { locale: "en" });
  check("its neighbour is untouched", untouched?.title === toLegalDoc(doc("privacy"), { locale: "en" }).title);

  const fresh = await getLegalDocument("terms", emptyCmsContext, { locale: "en" });
  check("a device with no edits sees the seed", fresh?.title !== "Terms of use");
}

// ── 12. The contact form ─────────────────────────────────────────────────────

console.log("12. The contact form");
{
  const good = await submitContactMessage({
    name: "Nadia",
    email: "nadia@example.com",
    topic: "order",
    message: "My order arrived without the drinks that were on the receipt.",
  });
  check("a valid message is accepted", good.data != null);

  const notification = contactMessageNotification(good.data!);
  check("it reaches operations", notification.audience === "admin");
  check("it is a system notification", notification.category === "system");
  check("it links to the content desk", notification.href === "/admin/cms");

  const cases: [string, Parameters<typeof submitContactMessage>[0], string][] = [
    ["a one-letter name", { name: "N", email: "a@b.co", topic: "order", message: "x".repeat(30) }, "cms.contact.errors.name"],
    ["a malformed address", { name: "Nadia", email: "nadia@", topic: "order", message: "x".repeat(30) }, "cms.contact.errors.email"],
    ["an unknown topic", { name: "Nadia", email: "a@b.co", topic: "hacking", message: "x".repeat(30) }, "cms.contact.errors.topic"],
    ["a two-word message", { name: "Nadia", email: "a@b.co", topic: "order", message: "too short" }, "cms.contact.errors.short"],
    ["an essay", { name: "Nadia", email: "a@b.co", topic: "order", message: "x".repeat(5000) }, "cms.contact.errors.long"],
  ];

  for (const [label, input, error] of cases) {
    const result = await submitContactMessage(input);
    check(`${label} is refused`, result.error === error, `${result.error}`);
  }
}

// ── 13. Every message resolves in every locale ───────────────────────────────

console.log("13. Message coverage");
{
  const catalogs = {
    en: JSON.parse(readFileSync("messages/en.json", "utf8")),
    bn: JSON.parse(readFileSync("messages/bn.json", "utf8")),
    ar: JSON.parse(readFileSync("messages/ar.json", "utf8")),
  } as Record<string, unknown>;

  function lookup(catalog: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>((node, key) => {
      if (node && typeof node === "object" && key in node) {
        return (node as Record<string, unknown>)[key];
      }
      return undefined;
    }, catalog);
  }

  const paths = new Set<string>();

  // 1. Every fallback key the seed points at has to exist.
  for (const document of seed) {
    for (const key of Object.values(document.fallbacks ?? {})) paths.add(key);
    for (const row of Object.values(document.values)) {
      if (!Array.isArray(row)) continue;
      for (const item of row as CmsRow[]) {
        if (typeof item === "object" && "values" in item && typeof item.values.labelKey === "string") {
          paths.add(item.values.labelKey);
        }
      }
    }
  }
  const fallbackCount = paths.size;
  check("the seed leans on the catalogs", fallbackCount > 20, `${fallbackCount} keys`);

  // 2. Every error the seam or the pure rules can emit.
  const errorKeys = [
    "required", "tooLong", "tooManyRows", "emptyRepeater", "href", "number", "date", "option",
    "slug", "window", "invalid", "notFound", "archived", "duplicateKey", "nothingToPublish",
    "locked", "notLive", "noDraft", "noRevision", "notCreatable", "notOrderable", "cannotMove",
  ];
  for (const key of errorKeys) paths.add(`cms.errors.${key}`);
  for (const key of ["name", "email", "topic", "short", "long"]) {
    paths.add(`contact.errors.${key}`);
  }

  // 3. Every status, action, reason and topic the admin can draw.
  for (const status of ["published", "draft", "scheduled", "expired", "archived"]) {
    paths.add(`cms.status.${status}`);
  }
  for (const action of [
    "created", "saved", "published", "unpublished", "reverted", "archived", "restored",
    "discarded", "reordered",
  ]) {
    paths.add(`cms.action.${action}`);
  }
  for (const reason of ["publish", "revert"]) paths.add(`cms.reason.${reason}`);
  for (const topic of ["order", "partner", "rider", "press", "other"]) {
    paths.add(`cms.topics.${topic}`);
    paths.add(`contact.topics.${topic}`);
  }

  // 4. The chrome of the three CMS surfaces.
  for (const key of [
    "title", "subtitle", "deviceNote", "resetContent", "toastReset", "pendingTitle", "review",
    "collectionsTitle", "countDocuments", "countDrafts", "countScheduled", "countGaps", "open",
    "auditTitle", "auditHint", "auditEmpty", "messagesTitle", "messagesHint", "messagesEmpty",
    "surface", "newDocument", "viewSurface", "filterAll", "searchPlaceholder", "listEmpty",
    "listEmptyBody", "updatedBy", "missingLocales", "fullyTranslated", "moveUp", "moveDown",
    "edit", "toastCreated", "unknownEditor", "lastSaved", "scheduleTitle", "scheduleHint",
    "publishAt", "unpublishAt", "immediately", "never", "historyTitle", "historyEmpty", "revert",
    "dangerTitle", "dangerHint", "unpublish", "archive", "restore", "unsaved", "draftWaiting",
    "upToDate", "discard", "saveDraft", "publish", "toastSaved", "toastPublished", "toastReverted",
    "toastDiscarded", "toastUnpublished", "toastArchived", "toastRestored", "fieldOn", "fieldUnset",
    "fieldFallback", "rowLabel", "addRow", "removeRow", "draftPending",
  ]) {
    paths.add(`cms.${key}`);
  }

  for (const key of [
    "metaTitle", "metaDescription", "channelsTitle", "channelsSubtitle", "formTitle", "name",
    "email", "topic", "message", "messageHint", "sending", "send", "sent", "sentNote",
    "officesTitle", "officesSubtitle", "phone", "hours",
  ]) {
    paths.add(`contact.${key}`);
  }

  // 5. The new keys elsewhere.
  for (const key of [
    "footer.contact", "footer.refund", "nav.becomeRider", "legal.refund", "legal.refundDescription",
    "admin.navContent", "notifications.admin.contactMessage.title",
    "notifications.admin.contactMessage.body",
  ]) {
    paths.add(key);
  }

  console.log(`  ${paths.size} message paths reachable from the CMS`);
  check("the phase's vocabulary is substantial", paths.size > 150, `${paths.size}`);

  for (const [locale, catalog] of Object.entries(catalogs)) {
    const missing = [...paths].filter((path) => typeof lookup(catalog, path) !== "string");
    check(
      `every message resolves in ${locale}`,
      missing.length === 0,
      missing.slice(0, 5).join(", "),
    );
  }

  // Placeholders have to line up, or a message renders `{count}`.
  const withParams: [string, string[]][] = [
    ["cms.subtitle", ["count"]],
    ["cms.pendingTitle", ["count"]],
    ["cms.surface", ["surface"]],
    ["cms.updatedBy", ["by", "when"]],
    ["cms.missingLocales", ["locales"]],
    ["cms.lastSaved", ["by", "when"]],
    ["cms.fieldFallback", ["key"]],
    ["cms.rowLabel", ["n"]],
    ["cms.errors.tooLong", ["max"]],
    ["cms.errors.tooManyRows", ["max"]],
    ["contact.messageHint", ["count"]],
    ["notifications.admin.contactMessage.body", ["name", "topic"]],
  ];

  for (const [locale, catalog] of Object.entries(catalogs)) {
    const wrong: string[] = [];
    for (const [path, expected] of withParams) {
      const template = lookup(catalog, path);
      if (typeof template !== "string") continue;
      const found = new Set([...template.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]));
      for (const name of expected) if (!found.has(name)) wrong.push(`${path}:{${name}}`);
    }
    check(`placeholders line up in ${locale}`, wrong.length === 0, wrong.slice(0, 5).join(", "));
  }

  // Arabic plurals need all six forms where a count is interpolated.
  const arabic = catalogs.ar;
  const pluralPaths = ["cms.subtitle", "cms.pendingTitle", "contact.messageHint"];
  const missingForms: string[] = [];
  for (const path of pluralPaths) {
    const template = lookup(arabic, path);
    if (typeof template !== "string") continue;
    for (const form of ["one", "two", "few", "many", "other"]) {
      if (!template.includes(`${form} {`)) missingForms.push(`${path}:${form}`);
    }
  }
  check("Arabic plurals are complete", missingForms.length === 0, missingForms.join(", "));
}

// ── 14. Titles and patches ───────────────────────────────────────────────────

console.log("14. Titles and patches");
{
  check(
    "a document titles itself from its own field",
    titleOf(cmsCollectionById.get("legal")!, doc("terms")) === "Terms of service",
  );
  check(
    "a title falls back to the handle",
    titleOf(cmsCollectionById.get("legal")!, doc("terms"), {}) === "terms",
  );

  // A patch merges rather than replacing, so a field added to the seed after an
  // edit was saved still appears.
  const patch: CmsDocPatch = { values: { title: en("Only the title") } };
  const patched = applyPatch(doc("terms"), patch);
  check("a patch merges over the seed", patched.values.sections !== undefined);
  check("the patched field wins", (patched.values.title as { en: string }).en === "Only the title");
}

// ── Result ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} assertions passed`);
if (failures.length) {
  console.error(`${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("C26 flow: all green");
