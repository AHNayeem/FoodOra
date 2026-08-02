import {
  categories,
  cuisines,
  foodById,
  foods,
  vendorById,
  vendors,
} from "@/lib/mock";
import type {
  AiReviewSummary,
  Allergen,
  AssistantBlock,
  AssistantContext,
  AssistantEntities,
  AssistantMessage,
  AssistantReply,
  AssistantSay,
  DietPlan,
  DishInsight,
  FoodItem,
  FoodProfile,
  ParsedRequest,
  Vendor,
} from "@/types";
import {
  LOW_CONFIDENCE,
  MAX_INPUT_LENGTH,
  MOODS,
  PROMPTS,
  STARTER_PROMPTS,
  dietaryFilters,
  emptySignals,
  matchesConstraints,
  parseRequest,
  recogniseDish,
  scoreDish,
  scoreVendor,
  searchHref,
  summariseReviews,
  type ParseVocabulary,
  type RankSignals,
} from "@/lib/ai";
import {
  GOAL_DIETARY,
  allergenConflicts,
  detectAllergens,
  estimateNutrition,
  isSafeFor,
  planDays,
  slotsFor,
  targetCalories,
  totalNutrition,
  type PlannerCandidate,
} from "@/lib/nutrition";
import { POSITIVE_TAGS } from "@/lib/reviews";
import {
  getVendorReviews,
  emptyContext as emptyReviewContext,
  type ReviewContext,
} from "./reviews";
import { mockDelay, ok, type Result } from "./http";

/**
 * ai.ts — the assistant seam (Phase C24).
 *
 * The same three responsibilities every seam in this codebase carries:
 *
 * 1. **It owns the clock.** The diet planner's day keys and every message
 *    timestamp are stamped here, once per call, so a three-day plan cannot
 *    straddle midnight halfway through being built.
 * 2. **It owns the rules.** An empty message, a paragraph, an unsupported file,
 *    a dish that no longer exists — each is refused *here* with an i18n key,
 *    not by a disabled button. And the one rule that matters most: when
 *    `personalized` is false the seam drops every id the customer's device
 *    handed it, so C28's privacy switch actually changes the answer instead of
 *    merely persisting.
 * 3. **It resolves the joins.** `lib/ai` is given the catalogue's vocabulary and
 *    hands back ids; this turns those into the dishes, vendors and review
 *    aggregates a reply embeds. Ids that no longer resolve are dropped rather
 *    than rendered as holes — the C23 favorites convention.
 *
 * **The composition of a reply lives here on purpose.** A real assistant would
 * have a model choose the words; this one chooses a *key* and a set of typed
 * blocks, which is the part a backend keeps either way. Swapping in a model in
 * Phase E means replacing `parseRequest` and this composer — every component
 * above, every store, and every shape in `types/ai.ts` stays as it is.
 */

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export function defaultFoodProfile(): FoodProfile {
  return { allergies: [], dietary: [], goal: "balanced", calorieTarget: null, budget: null };
}

export function emptyAssistantContext(): AssistantContext {
  return {
    profile: defaultFoodProfile(),
    recentVendorIds: [],
    recentFoodIds: [],
    favoriteVendorIds: [],
    favoriteFoodIds: [],
    activeOrderIds: [],
    personalized: true,
    vendorId: null,
  };
}

/**
 * What the ranking is allowed to know about this customer.
 *
 * The privacy switch is enforced *here*, at the single point every read passes
 * through, rather than at each call site — a rule that has to be remembered in
 * six places is a rule that will be forgotten in one. Allergies survive it:
 * they are safety, not personalisation, and refusing to apply them because
 * someone turned off recommendations would be the wrong reading of both.
 */
function signalsFrom(ctx: AssistantContext): RankSignals {
  const avoid = ctx.profile.allergies;
  if (!ctx.personalized) return { ...emptySignals(), avoid };
  return {
    recentVendorIds: ctx.recentVendorIds,
    recentFoodIds: ctx.recentFoodIds,
    favoriteVendorIds: ctx.favoriteVendorIds,
    favoriteFoodIds: ctx.favoriteFoodIds,
    avoid,
  };
}

/** The catalogue's own words, handed to the parser so `lib/ai` stays seedless. */
function vocabulary(): ParseVocabulary {
  return {
    categories: categories.map((c) => ({ slug: c.slug, name: c.name, keywords: c.keywords })),
    cuisines: cuisines.map((c) => ({ slug: c.slug, name: c.name })),
    vendors: vendors
      .filter((v) => !v.deletedAt)
      .map((v) => ({ id: v.id, name: v.name, type: v.type })),
    foods: foods.filter((f) => !f.deletedAt).map((f) => ({ id: f.id, name: f.name })),
  };
}

/** Every allergen in play: the standing profile plus anything this sentence added. */
function avoidList(ctx: AssistantContext, parsed: ParsedRequest): Allergen[] {
  return [...new Set([...ctx.profile.allergies, ...parsed.constraints.avoid])];
}

/** The profile's own dietary tags, applied to every answer as a floor. */
function withProfileDiet(parsed: ParsedRequest, profile: FoodProfile): ParsedRequest {
  const tags = new Set([...parsed.constraints.dietary, ...profile.dietary]);
  return { ...parsed, constraints: { ...parsed.constraints, dietary: [...tags] } };
}

// ---------------------------------------------------------------------------
// Ids → entities
// ---------------------------------------------------------------------------

function emptyEntities(): AssistantEntities {
  return { foods: {}, vendors: {} };
}

/**
 * Embed the entities a reply referenced. A conversation stores ids (so it can
 * never go stale against a repriced menu); this is the batch fetch that turns
 * them back into things to render, exactly as a chat endpoint would embed the
 * objects it named.
 */
export async function resolveEntities(ids: {
  foodIds?: string[];
  vendorIds?: string[];
}): Promise<AssistantEntities> {
  return mockDelay(collectEntities(ids.foodIds ?? [], ids.vendorIds ?? []), 120);
}

function collectEntities(foodIds: string[], vendorIds: string[]): AssistantEntities {
  const entities = emptyEntities();
  for (const id of new Set(foodIds)) {
    const food = foodById.get(id);
    if (!food || food.deletedAt) continue;
    entities.foods[id] = { food, vendorId: food.vendorId };
    const vendor = vendorById.get(food.vendorId);
    if (vendor) entities.vendors[vendor.id] = vendor;
  }
  for (const id of new Set(vendorIds)) {
    const vendor = vendorById.get(id);
    if (vendor && !vendor.deletedAt) entities.vendors[id] = vendor;
  }
  return entities;
}

/** Every food/vendor id a set of blocks refers to — the panel's rehydrate call. */
export function blockIds(blocks: AssistantBlock[]): { foodIds: string[]; vendorIds: string[] } {
  const foodIds: string[] = [];
  const vendorIds: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "dishes":
        foodIds.push(...block.foodIds);
        break;
      case "vendors":
        vendorIds.push(...block.vendorIds);
        break;
      case "insight":
        foodIds.push(block.insight.foodId);
        break;
      case "allergy":
        foodIds.push(...block.conflicts.map((i) => i.foodId), ...block.safe);
        break;
      case "plan":
        foodIds.push(...block.plan.days.flatMap((d) => d.meals.map((m) => m.foodId)));
        break;
      case "review-summary":
        vendorIds.push(block.summary.vendorId);
        foodIds.push(...block.summary.lovedFoodIds);
        break;
      case "recognition":
        foodIds.push(...block.result.foodIds);
        if (block.result.vendorId) vendorIds.push(block.result.vendorId);
        break;
      default:
        break;
    }
  }
  return { foodIds: foodIds.filter(Boolean), vendorIds: vendorIds.filter(Boolean) };
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

/** A dish with the vendor it belongs to — nothing is offered without its kitchen. */
interface Candidate {
  food: FoodItem;
  vendor: Vendor;
}

function allCandidates(): Candidate[] {
  return foods
    .filter((f) => !f.deletedAt && f.isAvailable)
    .map((food) => ({ food, vendor: vendorById.get(food.vendorId)! }))
    .filter((c) => Boolean(c.vendor) && !c.vendor.deletedAt);
}

/**
 * Rank the catalogue against a parse.
 *
 * When the hard filter leaves too little to answer with, it is dropped one step
 * at a time — price first, then the mood — and the caller is told which
 * concession was made (`relaxed`), because an assistant that silently ignores
 * "under 400" is worse than one that says it could not stay under 400.
 * Allergens and dietary tags are never relaxed.
 */
function rankDishes(
  parsed: ParsedRequest,
  ctx: AssistantContext,
  limit: number,
): { hits: Candidate[]; relaxed: "price" | "mood" | null } {
  const avoid = avoidList(ctx, parsed);
  const signals = signalsFrom(ctx);
  const pool = allCandidates();
  const scoped = ctx.vendorId ? pool.filter((c) => c.vendor.id === ctx.vendorId) : pool;

  const take = (p: ParsedRequest) =>
    scoped
      .filter((c) => matchesConstraints(c.food, c.vendor, p, avoid))
      .sort((a, b) => scoreDish(b.food, b.vendor, p, signals) - scoreDish(a.food, a.vendor, p, signals))
      .slice(0, limit);

  const strict = take(parsed);
  if (strict.length >= Math.min(3, limit)) return { hits: strict, relaxed: null };

  if (parsed.constraints.maxPrice !== null) {
    const withoutPrice = take({
      ...parsed,
      constraints: { ...parsed.constraints, maxPrice: null },
    });
    if (withoutPrice.length > strict.length) return { hits: withoutPrice, relaxed: "price" };
  }
  if (parsed.constraints.mood) {
    const withoutMood = take({ ...parsed, constraints: { ...parsed.constraints, mood: null } });
    if (withoutMood.length > strict.length) return { hits: withoutMood, relaxed: "mood" };
  }
  return { hits: strict, relaxed: null };
}

function rankVendors(parsed: ParsedRequest, ctx: AssistantContext, limit: number): Vendor[] {
  const signals = signalsFrom(ctx);
  const wanted = dietaryFilters(parsed.constraints);
  return vendors
    .filter((v) => !v.deletedAt)
    .filter((v) => (parsed.constraints.openNow ? v.isOpen : true))
    .filter((v) => wanted.every((tag) => v.dietary.includes(tag)))
    .sort((a, b) => scoreVendor(b, parsed, signals) - scoreVendor(a, parsed, signals))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

/** Everything the assistant can say about one dish, in one object. */
export function insightFor(food: FoodItem, avoid: Allergen[]): DishInsight {
  return {
    foodId: food.id,
    vendorId: food.vendorId,
    estimate: estimateNutrition(food),
    allergens: detectAllergens(food),
    conflicts: allergenConflicts(food, avoid),
    dietary: food.dietary,
  };
}

// ---------------------------------------------------------------------------
// Message plumbing
// ---------------------------------------------------------------------------

/**
 * Message ids follow the `ord_`/`QT-` convention — base-36 of the clock — with a
 * per-call counter, because a question and its answer are minted in the same
 * millisecond and two messages with one id would collapse in React's keying.
 */
let seq = 0;
function messageId(): string {
  seq = (seq + 1) % 1296;
  return `msg_${Date.now().toString(36)}${seq.toString(36).padStart(2, "0")}`;
}

interface Composed {
  say: AssistantSay;
  notes?: AssistantSay[];
  blocks?: AssistantBlock[];
  chips?: string[];
}

function assistantMessage(composed: Composed, nowMs: number): AssistantMessage {
  return {
    id: messageId(),
    role: "assistant",
    say: composed.say,
    notes: composed.notes?.length ? composed.notes : undefined,
    blocks: composed.blocks ?? [],
    chips: composed.chips ?? [],
    at: new Date(nowMs).toISOString(),
  };
}

/** The customer's turn. Their words are DATA — stored verbatim, never translated. */
export function userMessage(text: string, nowMs = Date.now()): AssistantMessage {
  return {
    id: messageId(),
    role: "user",
    text,
    blocks: [],
    chips: [],
    at: new Date(nowMs).toISOString(),
  };
}

/**
 * A turn the customer took without typing — uploading a photo, tapping a card.
 * It carries a key rather than words for the same reason the assistant's turns
 * do: "📷 Sent a photo" has to read in Bangla too.
 */
export function userAction(key: string, nowMs = Date.now()): AssistantMessage {
  return {
    id: messageId(),
    role: "user",
    say: { key },
    blocks: [],
    chips: [],
    at: new Date(nowMs).toISOString(),
  };
}

function reply(composed: Composed, parsed: ParsedRequest, nowMs: number): AssistantReply {
  const blocks = composed.blocks ?? [];
  const { foodIds, vendorIds } = blockIds(blocks);
  return {
    message: assistantMessage(composed, nowMs),
    entities: collectEntities(foodIds, vendorIds),
    parsed,
  };
}

// ---------------------------------------------------------------------------
// The composer — one branch per intent
// ---------------------------------------------------------------------------

/** Follow-ups offered under a dish answer. */
const DISH_CHIPS = ["calories", "allergyCheck", "cheapDinner"];

function dishBlocks(hits: Candidate[]): AssistantBlock[] {
  return hits.length ? [{ kind: "dishes", foodIds: hits.map((h) => h.food.id) }] : [];
}

function relaxNote(relaxed: "price" | "mood" | null): AssistantSay[] {
  return relaxed ? [{ key: `note.relaxed.${relaxed}` }] : [];
}

/** The dish answer — the shape most intents end up in. */
function composeDishes(
  parsed: ParsedRequest,
  ctx: AssistantContext,
  nowMs: number,
  say: AssistantSay,
  limit = 4,
): AssistantReply {
  const { hits, relaxed } = rankDishes(parsed, ctx, limit);
  const avoid = avoidList(ctx, parsed);
  const notes = [...relaxNote(relaxed)];

  if (!hits.length) {
    return reply(
      {
        say: { key: "reply.noDishes" },
        notes: avoid.length ? [{ key: "note.avoiding", values: { count: avoid.length } }] : [],
        blocks: [{ kind: "link", labelKey: "link.browseAll", href: searchHref(parsed) }],
        chips: ["surprise", "healthyLunch", "cheapDinner"],
      },
      parsed,
      nowMs,
    );
  }
  if (avoid.length) notes.push({ key: "note.screened", values: { count: avoid.length } });
  if (!ctx.personalized) notes.push({ key: "note.personalizedOff" });

  return reply(
    {
      say,
      notes,
      blocks: [
        ...dishBlocks(hits),
        { kind: "link", labelKey: "link.seeAll", href: searchHref(parsed) },
      ],
      chips: DISH_CHIPS,
    },
    parsed,
    nowMs,
  );
}

function composeVendors(parsed: ParsedRequest, ctx: AssistantContext, nowMs: number): AssistantReply {
  const hits = rankVendors(parsed, ctx, 4);
  if (!hits.length) {
    return reply(
      {
        say: { key: "reply.noVendors" },
        blocks: [{ kind: "link", labelKey: "link.browseAll", href: searchHref(parsed) }],
        chips: ["nearby", "surprise"],
      },
      parsed,
      nowMs,
    );
  }
  return reply(
    {
      say: { key: "reply.vendors", values: { count: hits.length } },
      notes: ctx.personalized ? [] : [{ key: "note.personalizedOff" }],
      blocks: [
        { kind: "vendors", vendorIds: hits.map((v) => v.id) },
        { kind: "link", labelKey: "link.seeAll", href: searchHref(parsed) },
      ],
      chips: ["nearby", "cheapDinner", "planWeek"],
    },
    parsed,
    nowMs,
  );
}

function composeNutrition(parsed: ParsedRequest, ctx: AssistantContext, nowMs: number): AssistantReply {
  const avoid = avoidList(ctx, parsed);
  const named = parsed.constraints.foodId ? foodById.get(parsed.constraints.foodId) : null;

  // No dish named: answer the *class* of question instead — the lightest dishes
  // that fit whatever else was asked for.
  if (!named) {
    const lightest = rankDishes(parsed, ctx, 4).hits;
    if (!lightest.length) {
      return reply(
        { say: { key: "reply.nutritionNoDish" }, chips: ["calories", "healthyLunch"] },
        parsed,
        nowMs,
      );
    }
    return reply(
      {
        say: { key: "reply.nutritionList" },
        notes: [{ key: "note.estimate" }],
        blocks: [{ kind: "dishes", foodIds: lightest.map((h) => h.food.id) }],
        chips: ["healthyLunch", "planWeek", "allergyCheck"],
      },
      parsed,
      nowMs,
    );
  }

  const insight = insightFor(named, avoid);
  return reply(
    {
      say: { key: "reply.nutrition", values: { dish: named.name } },
      notes: [
        { key: "note.estimate" },
        ...(insight.estimate.caloriesEstimated ? [{ key: "note.caloriesEstimated" }] : []),
      ],
      blocks: [{ kind: "insight", insight }],
      chips: ["allergyCheck", "healthyLunch", "planWeek"],
    },
    parsed,
    nowMs,
  );
}

function composeAllergy(parsed: ParsedRequest, ctx: AssistantContext, nowMs: number): AssistantReply {
  const avoid = avoidList(ctx, parsed);

  if (!avoid.length) {
    return reply(
      {
        say: { key: "reply.allergyNoProfile" },
        blocks: [{ kind: "profile" }],
        chips: ["allergyCheck", "healthyLunch"],
      },
      parsed,
      nowMs,
    );
  }

  // A named dish is a yes/no question about that dish.
  const named = parsed.constraints.foodId ? foodById.get(parsed.constraints.foodId) : null;
  if (named) {
    const insight = insightFor(named, avoid);
    return reply(
      {
        say: {
          key: insight.conflicts.length ? "reply.allergyUnsafe" : "reply.allergySafe",
          values: { dish: named.name },
        },
        notes: [{ key: "note.allergyDisclaimer" }],
        blocks: [{ kind: "insight", insight }],
        chips: ["allergyCheck", "healthyLunch"],
      },
      parsed,
      nowMs,
    );
  }

  // Otherwise: what *can* they eat — and, just as usefully, what they cannot.
  const pool = ctx.vendorId
    ? allCandidates().filter((c) => c.vendor.id === ctx.vendorId)
    : allCandidates();
  const safe = pool
    .filter((c) => isSafeFor(c.food, avoid))
    .sort((a, b) => scoreDish(b.food, b.vendor, parsed, signalsFrom(ctx)) - scoreDish(a.food, a.vendor, parsed, signalsFrom(ctx)))
    .slice(0, 4);
  const risky = pool
    .filter((c) => allergenConflicts(c.food, avoid).length)
    .filter((c) => c.food.isPopular)
    .slice(0, 3)
    .map((c) => insightFor(c.food, avoid));

  return reply(
    {
      say: { key: "reply.allergyScan", values: { count: avoid.length, safe: safe.length } },
      notes: [{ key: "note.allergyDisclaimer" }],
      blocks: [
        { kind: "allergy", conflicts: risky, safe: safe.map((c) => c.food.id) },
        ...(safe.length ? [{ kind: "dishes" as const, foodIds: safe.map((c) => c.food.id) }] : []),
      ],
      chips: ["healthyLunch", "planWeek", "cheapDinner"],
    },
    parsed,
    nowMs,
  );
}

/** "plan my meals for 5 days" → 5. Defaults to three, capped at a week. */
function planDaysAsked(text: string): number {
  const match = /(\d{1,2})\s*(?:day|days)/.exec(text);
  const asked = Number(match?.[1]);
  if (!Number.isFinite(asked)) return /\bweek\b/.test(text) ? 7 : 3;
  return Math.min(Math.max(asked, 1), MAX_PLAN_DAYS);
}

function composePlan(
  parsed: ParsedRequest,
  ctx: AssistantContext,
  nowMs: number,
  askedFor: string,
): AssistantReply {
  const built = buildPlanSync(ctx, planDaysAsked(askedFor), nowMs);
  if (!built || !built.days.length) {
    return reply({ say: { key: "reply.planEmpty" }, chips: ["healthyLunch"] }, parsed, nowMs);
  }
  return reply(
    {
      say: { key: "reply.plan", values: { days: built.days.length, target: built.target } },
      notes: [{ key: "note.estimate" }, { key: "note.planCost" }],
      blocks: [{ kind: "plan", plan: built }, { kind: "profile" }],
      chips: ["healthyLunch", "calories", "surprise"],
    },
    parsed,
    nowMs,
  );
}

function composeReorder(parsed: ParsedRequest, ctx: AssistantContext, nowMs: number): AssistantReply {
  if (!ctx.personalized) {
    return reply(
      { say: { key: "reply.reorderOff" }, chips: ["surprise", "healthyLunch"] },
      parsed,
      nowMs,
    );
  }
  const recent = ctx.recentFoodIds
    .map((id) => foodById.get(id))
    .filter((f): f is FoodItem => !!f && !f.deletedAt)
    .slice(0, 4);
  if (!recent.length) {
    return reply(
      {
        say: { key: "reply.reorderNone" },
        blocks: [{ kind: "link", labelKey: "link.browseAll", href: "/restaurants" }],
        chips: ["surprise", "cheapDinner"],
      },
      parsed,
      nowMs,
    );
  }
  const avoid = avoidList(ctx, parsed);
  const nowRisky = recent.filter((f) => allergenConflicts(f, avoid).length);
  return reply(
    {
      say: { key: "reply.reorder", values: { count: recent.length } },
      notes: nowRisky.length ? [{ key: "note.reorderConflict", values: { count: nowRisky.length } }] : [],
      blocks: [{ kind: "dishes", foodIds: recent.map((f) => f.id) }],
      chips: ["surprise", "healthyLunch"],
    },
    parsed,
    nowMs,
  );
}

function composeTracking(parsed: ParsedRequest, ctx: AssistantContext, nowMs: number): AssistantReply {
  const [orderId] = ctx.activeOrderIds;
  if (!orderId) {
    return reply(
      {
        say: { key: "reply.trackNone" },
        blocks: [{ kind: "link", labelKey: "link.orderHistory", href: "/account/orders" }],
        chips: ["surprise", "cheapDinner"],
      },
      parsed,
      nowMs,
    );
  }
  return reply(
    {
      say: { key: "reply.track" },
      blocks: [{ kind: "link", labelKey: "link.track", href: `/orders/${orderId}` }],
      chips: ["reorder", "surprise"],
    },
    parsed,
    nowMs,
  );
}

function composeHelp(parsed: ParsedRequest, nowMs: number): AssistantReply {
  return reply(
    {
      say: { key: "reply.help" },
      notes: [{ key: "note.howItWorks" }],
      blocks: [{ kind: "profile" }],
      chips: [...STARTER_PROMPTS],
    },
    parsed,
    nowMs,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ask the assistant something.
 *
 * Refuses an empty or over-long message with a key, then parses, then composes.
 * A low-confidence parse still answers — with a recommendation and a note
 * admitting it did not follow — because an assistant that returns nothing but
 * "I didn't understand" is the failure mode this whole phase exists to avoid.
 */
export async function ask(
  input: string,
  ctx: AssistantContext = emptyAssistantContext(),
): Promise<Result<AssistantReply>> {
  const text = input.trim();
  if (!text) return { data: null, error: "errors.empty" };
  if (text.length > MAX_INPUT_LENGTH) return { data: null, error: "errors.tooLong" };

  await mockDelay(null, 420);
  const nowMs = Date.now();
  const parsed = withProfileDiet(parseRequest(text, vocabulary()), ctx.profile);
  const c = parsed.constraints;

  // A named restaurant pins the whole answer to that menu, whichever intent it is.
  const scoped: AssistantContext = c.vendorId ? { ...ctx, vendorId: c.vendorId } : ctx;

  switch (parsed.intent) {
    case "greeting":
      return ok(
        reply(
          {
            say: { key: "reply.greeting" },
            blocks: [],
            chips: [...STARTER_PROMPTS],
          },
          parsed,
          nowMs,
        ),
      );
    case "help":
      return ok(composeHelp(parsed, nowMs));
    case "nutrition":
      return ok(composeNutrition(parsed, scoped, nowMs));
    case "allergy":
      return ok(composeAllergy(parsed, scoped, nowMs));
    case "diet-plan":
      return ok(composePlan(parsed, scoped, nowMs, text.toLowerCase()));
    case "reorder":
      return ok(composeReorder(parsed, scoped, nowMs));
    case "track-order":
      return ok(composeTracking(parsed, scoped, nowMs));
    case "find-vendor":
      return ok(composeVendors(parsed, scoped, nowMs));
    case "mood":
      return ok(
        composeDishes(parsed, scoped, nowMs, {
          key: "reply.mood",
          values: { mood: c.mood ?? "comfort" },
        }),
      );
    case "budget":
      return ok(
        composeDishes(parsed, scoped, nowMs, {
          key: c.people && c.people > 1 ? "reply.budgetParty" : "reply.budget",
          values: { price: c.maxPrice ?? 0, people: c.people ?? 1 },
        }),
      );
    // A dish search and a bare "recommend something" compose identically; only
    // the opening sentence differs. Low confidence overrides both: an assistant
    // that cannot say where it got an answer must at least say that it guessed.
    case "find-dish":
    default: {
      const key =
        parsed.confidence < LOW_CONFIDENCE
          ? "reply.unsure"
          : c.vendorId
            ? "reply.dishesAt"
            : parsed.intent === "find-dish"
              ? "reply.dishes"
              : "reply.recommend";
      return ok(
        composeDishes(parsed, scoped, nowMs, {
          key,
          values: { vendor: c.vendorId ? vendorById.get(c.vendorId)?.name ?? "" : "" },
        }),
      );
    }
  }
}

/**
 * The opening move: what to recommend before anything has been asked.
 *
 * Signed-out or with personalisation off this is simply the catalogue's best;
 * with history it leans on it, and says which it did — a recommendation whose
 * basis is invisible is one the customer cannot correct.
 */
export async function recommend(
  ctx: AssistantContext = emptyAssistantContext(),
  limit = 4,
): Promise<AssistantReply> {
  await mockDelay(null, 260);
  const nowMs = Date.now();
  const parsed = withProfileDiet(parseRequest("recommend something", vocabulary()), ctx.profile);
  const personal = ctx.personalized && (ctx.recentFoodIds.length > 0 || ctx.favoriteFoodIds.length > 0);
  return composeDishes(
    parsed,
    ctx,
    nowMs,
    { key: personal ? "reply.recommendPersonal" : "reply.recommend" },
    limit,
  );
}

/** The starter chips — profile-aware, so an allergy sufferer is offered the scan. */
export async function getSuggestedPrompts(
  ctx: AssistantContext = emptyAssistantContext(),
): Promise<string[]> {
  const keys = [...STARTER_PROMPTS] as string[];
  if (ctx.profile.allergies.length) keys.unshift("allergyCheck");
  if (ctx.personalized && ctx.recentFoodIds.length) keys.unshift("reorder");
  return mockDelay([...new Set(keys)].slice(0, 6), 80);
}

/** The English sentence a chip sends. Unknown keys fall through unchanged. */
export function promptText(key: string): string {
  return PROMPTS[key] ?? key;
}

/** One dish, fully analysed — the nutrition panel's entry point. */
export async function analyseDish(
  foodId: string,
  ctx: AssistantContext = emptyAssistantContext(),
): Promise<Result<DishInsight>> {
  const food = foodById.get(foodId);
  if (!food || food.deletedAt) return { data: null, error: "errors.notFound" };
  return ok(await mockDelay(insightFor(food, ctx.profile.allergies), 180));
}

// ---------------------------------------------------------------------------
// Diet planner
// ---------------------------------------------------------------------------

/** Longest plan the catalogue can fill without repeating itself into nonsense. */
export const MAX_PLAN_DAYS = 7;

function buildPlanSync(ctx: AssistantContext, days: number, nowMs: number): DietPlan | null {
  const { profile } = ctx;
  const target = targetCalories(profile.goal, profile.calorieTarget);
  const avoid = profile.allergies;
  const required = [...new Set([...profile.dietary, ...GOAL_DIETARY[profile.goal]])];

  const pool = allCandidates()
    .filter((c) => isSafeFor(c.food, avoid))
    .filter((c) => required.every((tag) => c.food.dietary.includes(tag)))
    .filter((c) => (profile.budget ? c.food.price <= profile.budget : true));

  if (!pool.length) return null;

  const candidates: PlannerCandidate[] = pool.map((c) => ({
    food: c.food,
    vendorId: c.vendor.id,
    nutrition: estimateNutrition(c.food).nutrition,
    slots: slotsFor(c.food),
  }));

  const planned = planDays(candidates, target, Math.min(Math.max(days, 1), MAX_PLAN_DAYS), nowMs);
  const priceOf = (foodId: string) => foodById.get(foodId)?.price ?? 0;
  const totalCost = planned.reduce(
    (sum, day) => sum + day.meals.reduce((d, meal) => d + priceOf(meal.foodId), 0),
    0,
  );

  return {
    goal: profile.goal,
    target,
    days: planned,
    totalCost,
    // Every seeded vendor prices in its own currency; the plan reports the one
    // its first meal was priced in rather than adding two currencies together.
    currency: vendorById.get(planned[0]?.meals[0]?.vendorId ?? "")?.currency ?? "BDT",
  };
}

/**
 * Build a diet plan (spec: Diet Planner, Meal Recommendation).
 *
 * The plan is **projected, never stored** — the C15 rule. It is a *proposal*
 * assembled from today's catalogue against the profile's goal; nothing is
 * ordered, nothing is scheduled, and building it twice on the same day with the
 * same profile gives the same days, because the planner is a deterministic
 * best-fit rather than a shuffle.
 */
export async function buildDietPlan(
  ctx: AssistantContext = emptyAssistantContext(),
  days = 3,
): Promise<Result<{ plan: DietPlan; entities: AssistantEntities }>> {
  if (days < 1 || days > MAX_PLAN_DAYS) return { data: null, error: "errors.planRange" };
  await mockDelay(null, 380);
  const plan = buildPlanSync(ctx, days, Date.now());
  if (!plan || !plan.days.length) return { data: null, error: "errors.planEmpty" };
  const foodIds = plan.days.flatMap((day) => day.meals.map((meal) => meal.foodId));
  return ok({ plan, entities: collectEntities(foodIds, []) });
}

/** Day totals against the target — the ring above the planner. */
export function planTotals(plan: DietPlan) {
  const all = plan.days.flatMap((day) => day.meals.map((meal) => meal.nutrition));
  const total = totalNutrition(all);
  const perDay = plan.days.length || 1;
  return {
    average: {
      calories: Math.round(total.calories / perDay),
      protein: Math.round(total.protein / perDay),
      carbs: Math.round(total.carbs / perDay),
      fat: Math.round(total.fat / perDay),
    },
    target: plan.target,
  };
}

// ---------------------------------------------------------------------------
// Review summary
// ---------------------------------------------------------------------------

/**
 * What a restaurant's reviews add up to (spec: AI Review Summary).
 *
 * Reads the C22 corpus through its own seam rather than the seeds, so the
 * summary and the review list underneath it are looking at the same reviews —
 * including whatever this device wrote. No new statistic is invented here: the
 * aggregate is C22's, this only decides which parts of it are worth saying.
 */
export async function getReviewSummary(
  vendorId: string,
  ctx: ReviewContext = emptyReviewContext(),
): Promise<Result<AiReviewSummary>> {
  const vendor = vendorById.get(vendorId);
  if (!vendor || vendor.deletedAt) return { data: null, error: "errors.notFound" };
  const page = await getVendorReviews(vendorId, ctx, { pageSize: 30 });
  return ok(
    summariseReviews(
      vendorId,
      page.summary,
      POSITIVE_TAGS,
      page.loved.map((dish) => dish.foodId),
    ),
  );
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** Files the picker accepts, and the ceiling above which we refuse to try. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Just enough of a file to fingerprint it without reading a byte of pixel data. */
export interface ImageFingerprint {
  name: string;
  size: number;
  type: string;
}

/**
 * "Recognise" a photo (spec: Image Search, Food Recognition, OCR Menu Scanner).
 *
 * **There is no vision model, and the UI says so on every result.** What there
 * is: a deterministic match, so the same photo always gives the same answer, and
 * a filename that is genuinely read — `biryani.jpg` really does come back as
 * biryani. The confidence is reported honestly (low when it was a draw, high
 * only when the filename carried the answer), the top match is always
 * correctable from the runners-up, and the file never leaves the browser.
 */
export async function recogniseImage(
  file: ImageFingerprint,
  mode: "dish" | "menu",
  ctx: AssistantContext = emptyAssistantContext(),
): Promise<Result<AssistantReply>> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { data: null, error: "errors.unsupportedFile" };
  }
  if (file.size > MAX_IMAGE_BYTES) return { data: null, error: "errors.fileTooLarge" };

  await mockDelay(null, 900);
  const nowMs = Date.now();
  const avoid = ctx.profile.allergies;
  const pool = allCandidates()
    .filter((c) => (ctx.vendorId ? c.vendor.id === ctx.vendorId : true))
    .map((c) => c.food);

  const result = recogniseDish(
    file.name,
    `${file.name}:${file.size}:${file.type}`,
    pool,
    mode,
    (food) => food.vendorId,
  );
  if (!result.foodIds.length) return { data: null, error: "errors.notFound" };

  const parsed = parseRequest(file.name.replace(/[-_]+/g, " "), vocabulary());
  const [topId] = result.foodIds;
  const top = foodById.get(topId);
  const conflicts = top ? allergenConflicts(top, avoid) : [];

  return ok(
    reply(
      {
        say: {
          key: mode === "menu" ? "reply.scanMenu" : "reply.scanDish",
          values: {
            dish: top?.name ?? "",
            vendor: vendorById.get(result.vendorId ?? "")?.name ?? "",
            confidence: Math.round(result.confidence * 100),
          },
        },
        notes: [
          { key: "note.recognitionMock" },
          ...(conflicts.length
            ? [{ key: "note.recognitionConflict", values: { count: conflicts.length } }]
            : []),
        ],
        blocks: [
          { kind: "recognition", result },
          { kind: "dishes", foodIds: result.foodIds },
        ],
        chips: ["calories", "allergyCheck", "surprise"],
      },
      parsed,
      nowMs,
    ),
  );
}

// ---------------------------------------------------------------------------
// AI Search
// ---------------------------------------------------------------------------

/** What the search page shows above its results when a query reads like a sentence. */
export interface SearchInterpretation {
  parsed: ParsedRequest;
  /** The parse as chips: a label key, its values, and the facet it set. */
  chips: { key: string; values?: Record<string, string | number> }[];
  href: string;
}

/**
 * Read a search box query as a sentence (spec: AI Search).
 *
 * Returns null when the query is just a word or two — "pizza" needs no
 * interpreting, and a banner over an obvious search is noise. Only when the
 * parser found real constraints does the page offer the reading, as chips the
 * customer can see and a link that applies them.
 */
export async function interpretSearch(query: string): Promise<SearchInterpretation | null> {
  const text = query.trim();
  if (text.length < 8 || text.split(/\s+/).length < 3) return null;

  const parsed = parseRequest(text, vocabulary());
  const c = parsed.constraints;
  const chips: SearchInterpretation["chips"] = [];

  if (c.mood) chips.push({ key: "chip.mood", values: { mood: c.mood } });
  if (c.maxPrice !== null) chips.push({ key: "chip.maxPrice", values: { price: c.maxPrice } });
  if (c.maxCalories !== null) chips.push({ key: "chip.maxCalories", values: { calories: c.maxCalories } });
  for (const tag of c.dietary) chips.push({ key: "chip.dietary", values: { tag } });
  for (const allergen of c.avoid) chips.push({ key: "chip.avoid", values: { allergen } });
  if (c.spicy) chips.push({ key: "chip.spicy" });
  if (c.healthy) chips.push({ key: "chip.healthy" });
  if (c.openNow) chips.push({ key: "chip.openNow" });
  if (c.people) chips.push({ key: "chip.people", values: { count: c.people } });
  if (c.vendorType) chips.push({ key: "chip.vendorType", values: { type: c.vendorType } });
  if (c.cuisineSlug) {
    const cuisine = cuisines.find((x) => x.slug === c.cuisineSlug);
    if (cuisine) chips.push({ key: "chip.cuisine", values: { name: cuisine.name } });
  }
  if (c.categorySlug) {
    const category = categories.find((x) => x.slug === c.categorySlug);
    if (category) chips.push({ key: "chip.category", values: { name: category.name } });
  }

  if (chips.length < 2) return null;
  return mockDelay({ parsed, chips, href: searchHref(parsed) }, 60);
}

/** The mood vocabulary, for the UI's mood rail. */
export function moodKeys(): string[] {
  return Object.keys(MOODS);
}
