import type { FoodItem, Vendor } from "./catalog";
import type { DietaryTag, ISODate, VendorType } from "./common";
import type { MealSlot, NutritionFacts, PlanGoal } from "./subscription";

/**
 * ai.ts — the food assistant (Phase C24; spec: AI Food Assistant, AI Chat,
 * AI Recommendation, Mood/Budget Based Search, Allergy Warning, Nutrition
 * Analysis, Diet Planner, AI Search, Voice Search, Image Search, Food
 * Recognition, OCR Menu Scanner, AI Review Summary).
 *
 * **There is no model here, and the assistant never pretends there is one.**
 * Every answer is assembled from the catalogue the rest of the app already
 * owns: a deterministic parser turns a sentence into constraints, the same
 * ranking the search page uses picks the dishes, and each claim it makes —
 * macros, allergens, review themes — comes from a pure function in
 * `lib/nutrition.ts` / `lib/ai.ts`. Phase E swaps the parser for a real model
 * *behind `services/ai.ts`*; the shapes below are what that model would have to
 * return, which is why they are structured data and not prose.
 *
 * Three consequences of that, visible in these types:
 *
 *  - **A reply is a key plus data, never a sentence.** `AssistantSay` is an
 *    i18n key and its values; `AssistantBlock`s are typed cards. The
 *    conversation therefore *re-renders in Bangla or Arabic* when the locale
 *    switches, which prose in a store never could.
 *  - **Blocks reference ids, never entities** (the C23 favorites rule). A
 *    conversation kept in `stores/assistant` cannot go stale against a renamed
 *    dish or a repriced menu; the seam resolves ids to entities on every read
 *    and hands them back in `AssistantReply.entities`, exactly as a chat
 *    endpoint would embed the objects it referenced.
 *  - **Nothing derived is stored.** Macros and allergens are *estimates*
 *    computed on demand and labelled as such in the UI, because the seed has
 *    calories and a description and nothing else — inventing a `protein` column
 *    would be claiming a certainty the data does not have.
 */

/**
 * The allergen vocabulary the assistant screens against — the fourteen EU
 * allergens trimmed to the nine that actually occur in this catalogue, because
 * a warning for something no dish contains is noise.
 *
 * These are *inferred* from a dish's name, description and dietary tags
 * (`lib/nutrition.detectAllergens`), never stored on `FoodItem`: a real
 * platform gets them declared by the vendor, and Phase E adds that column while
 * the inference stays as the fallback for menus nobody has annotated yet.
 */
export type Allergen =
  | "gluten"
  | "dairy"
  | "eggs"
  | "nuts"
  | "peanuts"
  | "soy"
  | "shellfish"
  | "fish"
  | "sesame";

/** How much of the dish's description actually supported the estimate. */
export type EstimateConfidence = "high" | "medium" | "low";

/**
 * Macros for one dish. `NutritionFacts` is reused verbatim from C15 so a plan
 * meal and an à-la-carte dish are measured in the same units — the diet planner
 * mixes both.
 */
export interface NutritionEstimate {
  nutrition: NutritionFacts;
  confidence: EstimateConfidence;
  /**
   * Which macro profile the dish was matched to (`fried`, `salad`, `dessert`,
   * …). Shown to the customer as *why* the numbers look like they do — the
   * honest substitute for a model's reasoning.
   */
  profile: string;
  /** True when the seed had no calorie count and even that was estimated. */
  caloriesEstimated: boolean;
}

/** A dish plus everything the assistant worked out about it. */
export interface DishInsight {
  foodId: string;
  vendorId: string;
  estimate: NutritionEstimate;
  /** Allergens the description suggests are present. */
  allergens: Allergen[];
  /** The subset of {@link allergens} the customer asked to avoid. */
  conflicts: Allergen[];
  dietary: DietaryTag[];
}

/**
 * A mood is a *query in disguise*: "comfort food" is not a cuisine, a price
 * band or a tag, but it maps onto all three. Keeping the vocabulary closed
 * (rather than free text) is what lets the mood be translated, offered as a
 * chip, and scored the same way every time.
 */
export type Mood =
  | "comfort"
  | "light"
  | "celebrate"
  | "hangover"
  | "date-night"
  | "quick"
  | "cosy"
  | "adventurous";

/** What the customer is asking for. Drives which reply the seam composes. */
export type AssistantIntent =
  | "greeting"
  | "help"
  | "recommend"
  | "find-dish"
  | "find-vendor"
  | "budget"
  | "mood"
  | "nutrition"
  | "allergy"
  | "diet-plan"
  | "reorder"
  | "track-order"
  | "unknown";

/**
 * Everything the parser managed to pull out of a sentence. Deliberately the
 * same vocabulary the search facets use (`DietaryTag`, `VendorType`, slugs), so
 * `toSearchQuery` can hand a parsed sentence straight to `services/search` —
 * that hand-off *is* the "AI Search" feature.
 */
export interface RequestConstraints {
  dietary: DietaryTag[];
  /** Allergens the sentence asked to keep out ("no nuts", "dairy free"). */
  avoid: Allergen[];
  /** Ceiling in the vendor's currency, from "under 500" / "cheap". */
  maxPrice: number | null;
  maxCalories: number | null;
  mood: Mood | null;
  vendorType: VendorType | null;
  cuisineSlug: string | null;
  categorySlug: string | null;
  /** A named restaurant the sentence pinned the question to. */
  vendorId: string | null;
  /** A named dish ("is the diavola spicy?"). */
  foodId: string | null;
  spicy: boolean;
  healthy: boolean;
  openNow: boolean;
  /** "for two", "party of 6" — sizes the budget, not the search. */
  people: number | null;
}

/** The parser's whole output: what was asked, and what it was asked about. */
export interface ParsedRequest {
  intent: AssistantIntent;
  /** Free-text terms left after the constraints were lifted out. */
  terms: string[];
  constraints: RequestConstraints;
  /**
   * 0–1. How much of the sentence the parser actually accounted for. Below
   * `LOW_CONFIDENCE` the assistant says so rather than answering confidently —
   * the one thing a mock assistant must never fake.
   */
  confidence: number;
}

/** An assistant sentence: an i18n key and its ICU values. Never prose. */
export interface AssistantSay {
  /** Key under the `ai` namespace, e.g. `reply.dishesFound`. */
  key: string;
  values?: Record<string, string | number>;
}

/** A day of the diet planner: three slots drawn from the live catalogue. */
export interface DietPlanMeal {
  slot: MealSlot;
  foodId: string;
  vendorId: string;
  nutrition: NutritionFacts;
}

export interface DietPlanDay {
  /** Plain local "YYYY-MM-DD" (the C15 rule — never `toISOString`). */
  date: string;
  meals: DietPlanMeal[];
  total: NutritionFacts;
}

export interface DietPlan {
  goal: PlanGoal;
  /** Calories the plan aimed at per day. */
  target: number;
  days: DietPlanDay[];
  /** Sum of every meal's price, in the plan's currency. */
  totalCost: number;
  currency: string;
}

/** What a vendor's reviews add up to, in themes rather than numbers. */
export interface AiReviewSummary {
  vendorId: string;
  reviewCount: number;
  average: number;
  /** `verdict.loved` | `.solid` | `.mixed` | `.poor` — a key, not a sentence. */
  verdictKey: string;
  /** The tags people keep using, most-used first. */
  praise: string[];
  gripes: string[];
  /** Aspect → 1–5, only the aspects enough reviews scored. */
  aspects: { aspect: string; score: number }[];
  /** Dishes named most often in the corpus (FK → `food_*`). */
  lovedFoodIds: string[];
  /** Share of reviewers who would order again, 0–1. */
  recommendShare: number;
}

/** What the camera "saw". Deterministic — see `lib/ai.recogniseDish`. */
export interface RecognitionResult {
  /** `dish` = Food Recognition / Image Search; `menu` = OCR Menu Scanner. */
  mode: "dish" | "menu";
  /** 0–1, derived from the fingerprint — never a claim of real vision. */
  confidence: number;
  /** Best match, then the runners-up the customer can correct it with. */
  foodIds: string[];
  /** For `menu`: the vendor whose card was "read". */
  vendorId: string | null;
}

/**
 * A card in a reply. Ids only — the panel renders them from
 * {@link AssistantEntities}, so a conversation restored from localStorage next
 * week shows today's prices.
 */
export type AssistantBlock =
  | { kind: "dishes"; foodIds: string[] }
  | { kind: "vendors"; vendorIds: string[] }
  | { kind: "insight"; insight: DishInsight }
  | { kind: "allergy"; conflicts: DishInsight[]; safe: string[] }
  | { kind: "plan"; plan: DietPlan }
  | { kind: "review-summary"; summary: AiReviewSummary }
  | { kind: "link"; labelKey: string; values?: Record<string, string | number>; href: string }
  | { kind: "recognition"; result: RecognitionResult }
  | { kind: "profile" };

/** One turn. The user's turn keeps their words; the assistant's keeps keys. */
export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  /** The customer's own words — DATA, never translated. Assistant turns omit it. */
  text?: string;
  say?: AssistantSay;
  /** Extra sentences under the first, e.g. a caveat about the estimate. */
  notes?: AssistantSay[];
  blocks: AssistantBlock[];
  /** Follow-up chips, as `prompt.*` keys the composer can send verbatim. */
  chips: string[];
  at: ISODate;
}

/** Entities a reply referenced, embedded so the panel renders without a fetch. */
export interface AssistantEntities {
  foods: Record<string, { food: FoodItem; vendorId: string }>;
  vendors: Record<string, Vendor>;
}

/** What the seam answers with. */
export interface AssistantReply {
  message: AssistantMessage;
  entities: AssistantEntities;
  /** The parse behind it — surfaced in the UI as "what I understood". */
  parsed: ParsedRequest;
}

/**
 * The customer's standing food preferences: the assistant's memory.
 *
 * Deliberately *not* part of `CustomerSettings` (C28), which is scoped to
 * things that need a server to mean anything. This is the opposite: it changes
 * what the assistant says on this device and nothing else, so it lives with the
 * conversation it steers. Phase E promotes it to the user record — at which
 * point the same shape is what the endpoint returns.
 */
export interface FoodProfile {
  allergies: Allergen[];
  dietary: DietaryTag[];
  goal: PlanGoal;
  /** Daily calorie target, or null to use the goal's default. */
  calorieTarget: number | null;
  /** Typical spend per dish, used to soften "cheap"/"budget" into a number. */
  budget: number | null;
}

/**
 * What this device knows that the catalogue does not — the C16 `BookContext` /
 * C18 `RiderContext` / C22 `ReviewContext` pattern. Local history travels *into*
 * the seam so the seam stays the only place a recommendation is assembled.
 */
export interface AssistantContext {
  profile: FoodProfile;
  /** Vendors ordered from on this device, most recent first. */
  recentVendorIds: string[];
  /** Dishes ordered on this device, most recent first (FK → `food_*`). */
  recentFoodIds: string[];
  favoriteVendorIds: string[];
  favoriteFoodIds: string[];
  /** Live order ids, so "where's my food?" can link to the tracker. */
  activeOrderIds: string[];
  /**
   * `privacy.personalizedRecommendations` (C28). When false the seam ignores
   * every id above — the setting has to *do* something, not just persist.
   */
  personalized: boolean;
  /** A vendor page the panel was opened from: scopes the answer to that menu. */
  vendorId: string | null;
}
