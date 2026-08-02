import type {
  Allergen,
  AiReviewSummary,
  AssistantIntent,
  DietaryTag,
  FoodItem,
  Mood,
  ParsedRequest,
  RecognitionResult,
  RequestConstraints,
  Review,
  ReviewAspect,
  ReviewSummary,
  Vendor,
  VendorType,
} from "@/frontend/types";
import { ALLERGENS, allergenConflicts } from "./nutrition";

/**
 * ai.ts — the assistant's understanding (Phase C24; spec: AI Food Assistant,
 * AI Chat, AI Search, Mood/Budget Based Search, AI Review Summary, Food
 * Recognition, OCR Menu Scanner).
 *
 * A sentence goes in, a set of constraints comes out — and those constraints
 * are the *same vocabulary the search facets already use* (`DietaryTag`,
 * `VendorType`, category and cuisine slugs). That is deliberate and it is the
 * whole trick: "something cheap and vegan for two, no peanuts" parses into
 * filters the C4 search page could have been given by hand, so the assistant
 * never has a private notion of what a dish is. `searchHref` is the proof —
 * every parse can be handed to `/search` and produce the same results.
 *
 * Pure, clock-free, and — like every `lib/*` module here — it never touches
 * `lib/mock`. The catalogue's own words (category keywords, cuisine and vendor
 * names) arrive as a {@link ParseVocabulary} the seam assembles, which is what
 * lets the parser recognise "Bella Napoli" or "Thai" without importing seeds.
 *
 * **What it is not:** a language model. It reads keywords, it does not read
 * meaning, and it reports how much of the sentence it accounted for
 * ({@link ParsedRequest.confidence}) so the UI can admit when it is guessing.
 * Phase E replaces `parseRequest` with a real model *behind `services/ai.ts`*;
 * `ParsedRequest` is exactly the structured output such a model would be asked
 * to emit, so nothing downstream changes.
 *
 * Matching is English-first, with the handful of Bangla and Arabic words a
 * hungry person actually types folded into the keyword lists. Everything a
 * non-English speaker needs to reach without typing — moods, budgets, diets —
 * is offered as a localised chip by the UI, which sends the English phrase.
 */

/** Below this, the assistant says it is unsure instead of answering flatly. */
export const LOW_CONFIDENCE = 0.34;

/**
 * The starter chips, and the sentence each one sends.
 *
 * A chip is a *label key* plus a fixed English phrase, not a translated
 * sentence, because the phrase goes back through {@link parseRequest} and the
 * parser reads English. So a Bangla or Arabic speaker sees "হালকা দুপুরের খাবার",
 * taps it, and the parser receives "a healthy light lunch" — the localised path
 * into an English-first parser, and the reason the chips exist at all.
 */
export const PROMPTS: Record<string, string> = {
  cheapDinner: "something tasty under 400 taka",
  healthyLunch: "a healthy light lunch",
  spicy: "something really spicy",
  comfort: "comfort food for a rainy evening",
  dateNight: "a date night dinner for two",
  quick: "something quick, I'm starving",
  vegan: "vegan dinner under 600",
  planWeek: "plan my meals for 3 days",
  calories: "how many calories is the Margherita DOP",
  allergyCheck: "what is safe for me without peanuts",
  reorder: "order my usual again",
  surprise: "surprise me with something new",
  nearby: "a good cafe open now",
  budgetTable: "dinner for four under 2000",
};

/** Chip keys, in the order the empty conversation offers them. */
export const STARTER_PROMPTS = [
  "healthyLunch",
  "cheapDinner",
  "comfort",
  "spicy",
  "planWeek",
  "surprise",
] as const;

/** Longest input accepted. A paragraph is a sign something else is wrong. */
export const MAX_INPUT_LENGTH = 240;

// ─── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * The catalogue's own words, handed in by the seam. Only the fields the parser
 * actually reads — a narrow port, so a real backend can serve it from an index
 * rather than shipping the whole catalogue.
 */
export interface ParseVocabulary {
  categories: { slug: string; name: string; keywords: string[] }[];
  cuisines: { slug: string; name: string }[];
  vendors: { id: string; name: string; type: VendorType }[];
  foods: { id: string; name: string }[];
}

export function emptyVocabulary(): ParseVocabulary {
  return { categories: [], cuisines: [], vendors: [], foods: [] };
}

/**
 * A mood is a query in disguise. Each one names the dish words it leans on, the
 * dietary tags it implies and — where the mood is really about money or time —
 * a ceiling. `weight` scales how hard the mood pushes the ranking.
 */
export interface MoodRule {
  keywords: string[];
  /** Dish words that satisfy the mood, scored on name + description. */
  prefer: string[];
  dietary: DietaryTag[];
  /** Dish words that actively contradict it. */
  avoid: string[];
  /** Only for moods that are about price or speed. */
  maxPrice: number | null;
  maxEta: number | null;
}

const mood = (
  keywords: string[],
  prefer: string[],
  extra: Partial<Omit<MoodRule, "keywords" | "prefer">> = {},
): MoodRule => ({
  keywords,
  prefer,
  dietary: [],
  avoid: [],
  maxPrice: null,
  maxEta: null,
  ...extra,
});

/** The closed mood vocabulary. Keys resolve to `ai.mood.<mood>`. */
export const MOODS: Record<Mood, MoodRule> = {
  comfort: mood(
    ["comfort", "comforting", "cosy food", "homely", "home cooked", "soul food", "আরাম", "راحة"],
    ["biryani", "khichuri", "curry", "lasagna", "pasta", "mac", "cheese", "soup", "stew", "roast"],
  ),
  light: mood(
    ["light", "healthy", "clean", "fresh", "not heavy", "low calorie", "diet", "হালকা", "خفيف"],
    ["salad", "bowl", "grilled", "soup", "poke", "greens", "steamed", "juice", "smoothie"],
    { dietary: ["healthy"], avoid: ["fried", "cheese", "cream", "brownie", "cake"] },
  ),
  celebrate: mood(
    ["celebrate", "celebration", "birthday", "party", "treat myself", "feast", "উৎসব", "احتفال"],
    ["platter", "cake", "sharing", "special", "signature", "grill", "sushi", "steak", "dessert"],
  ),
  hangover: mood(
    ["hangover", "hungover", "greasy", "rough morning", "need grease"],
    ["burger", "fries", "khichuri", "ramen", "noodle", "eggs", "cheese", "shake", "coffee"],
  ),
  "date-night": mood(
    ["date night", "date", "romantic", "anniversary", "impress", "রোমান্টিক", "موعد"],
    ["sushi", "pasta", "steak", "wine", "platter", "dessert", "tiramisu", "signature"],
  ),
  quick: mood(
    ["quick", "fast", "in a hurry", "asap", "starving", "right now", "দ্রুত", "سريع"],
    ["burger", "wrap", "sandwich", "roll", "toastie", "samosa", "noodle", "fries"],
    { maxEta: 30 },
  ),
  cosy: mood(
    ["cosy", "cozy", "rainy", "warm", "chilly", "বৃষ্টি", "دافئ"],
    ["soup", "ramen", "khichuri", "tea", "coffee", "cocoa", "hot", "broth", "curry"],
  ),
  adventurous: mood(
    ["adventurous", "something new", "surprise me", "try something", "unusual", "নতুন", "جديد"],
    ["signature", "special", "chef", "fusion", "authentic", "traditional"],
  ),
};

/** Words that mean "not much money", and the ceiling each implies (BDT-scale). */
const CHEAP_WORDS = ["cheap", "budget", "affordable", "inexpensive", "সস্তা", "رخيص"];
const CHEAP_CEILING = 400;

/** How a stated head-count multiplies a stated budget into a per-dish ceiling. */
const MAX_PARTY = 20;

const DIETARY_WORDS: Record<DietaryTag, string[]> = {
  halal: ["halal", "হালাল", "حلال"],
  vegetarian: ["vegetarian", "veggie", "veg only", "no meat", "নিরামিষ", "نباتي"],
  vegan: ["vegan", "plant based", "plant-based", "ভেগান"],
  "gluten-free": ["gluten free", "gluten-free", "no gluten", "coeliac", "celiac"],
  keto: ["keto", "ketogenic", "low carb", "low-carb"],
  healthy: ["healthy", "nutritious", "wholesome", "স্বাস্থ্যকর", "صحي"],
  spicy: ["spicy", "hot and spicy", "ঝাল", "حار"],
};

/** How each allergen gets named when someone is avoiding it. */
const ALLERGEN_WORDS: Record<Allergen, string[]> = {
  gluten: ["gluten", "wheat", "coeliac", "celiac"],
  dairy: ["dairy", "milk", "lactose", "cheese"],
  eggs: ["egg", "eggs"],
  nuts: ["nut", "nuts", "almond", "cashew", "pistachio", "বাদাম"],
  peanuts: ["peanut", "peanuts", "groundnut"],
  soy: ["soy", "soya", "tofu"],
  shellfish: ["shellfish", "prawn", "shrimp", "crab", "lobster", "চিংড়ি"],
  fish: ["fish", "seafood", "মাছ", "سمك"],
  sesame: ["sesame", "tahini", "til"],
};

/** Phrases that turn a mentioned allergen into an avoidance rather than a want. */
const AVOID_PREFIXES = [
  "no ", "without ", "avoid ", "allergic to ", "allergy to ", "free from ", "skip the ",
  "can't have ", "cannot have ", "cant have ", "intolerant to ", "ছাড়া", "بدون ",
];

const VENDOR_TYPE_WORDS: Record<VendorType, string[]> = {
  restaurant: ["restaurant", "restaurants", "place to eat", "রেস্টুরেন্ট", "مطعم"],
  cafe: ["cafe", "café", "coffee shop", "coffeeshop", "ক্যাফে", "مقهى"],
  "cloud-kitchen": ["cloud kitchen", "delivery only", "ghost kitchen"],
  "home-chef": ["home chef", "home-chef", "homemade", "home cook", "ঘরোয়া"],
  catering: ["catering", "caterer", "event food", "কেটারিং"],
};

/** Intent triggers, tried in this order — the earliest match wins. */
const INTENT_WORDS: [AssistantIntent, string[]][] = [
  ["track-order", ["where is my order", "track my order", "where's my food", "order status", "my delivery"]],
  ["reorder", ["reorder", "order again", "my usual", "same as last", "last order", "again please"]],
  ["diet-plan", ["meal plan", "diet plan", "plan my", "plan for the week", "what should i eat today", "eating plan", "menu for the week", "ডায়েট", "خطة"]],
  ["allergy", ["allergic", "allergy", "allergen", "safe for me", "does it contain", "contains", "can i eat", "intolerant", "অ্যালার্জি", "حساسية"]],
  ["nutrition", ["calorie", "calories", "kcal", "protein", "carbs", "macros", "nutrition", "how healthy", "fat content", "ক্যালোরি", "سعرات"]],
  ["help", ["what can you do", "help me", "how do you work", "who are you", "what are you"]],
  ["greeting", ["hello", "hi ", "hey", "good morning", "good evening", "salam", "assalam", "হ্যালো", "مرحبا"]],
];

/** Words that carry no search value; ignored when scoring what we understood. */
const STOPWORDS = new Set([
  "a", "an", "and", "any", "are", "can", "could", "do", "find", "for", "get", "give",
  "good", "have", "hey", "i", "id", "im", "is", "it", "like", "looking", "me", "my",
  "need", "of", "or", "please", "recommend", "show", "some", "something", "suggest",
  "thanks", "that", "the", "to", "today", "tonight", "want", "what", "with", "would",
  "you", "your", "eat", "order", "food", "dish", "dishes", "meal", "now", "near", "in",
  "on", "at", "am", "be", "us", "we", "there", "here", "please", "under", "below",
  "over", "than", "less", "more", "up", "about", "just", "really", "very",
]);

// ─── Parsing ─────────────────────────────────────────────────────────────────

function emptyConstraints(): RequestConstraints {
  return {
    dietary: [],
    avoid: [],
    maxPrice: null,
    maxCalories: null,
    mood: null,
    vendorType: null,
    cuisineSlug: null,
    categorySlug: null,
    vendorId: null,
    foodId: null,
    spicy: false,
    healthy: false,
    openNow: false,
    people: null,
  };
}

/** Lower-case, strip punctuation that never carries meaning, squash spaces. */
function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,!?;:"'’()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `text` contains any of `words`. */
function has(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

/**
 * The first number that reads like a price ceiling. Handles "under 500",
 * "below ৳400", "max 600", "up to 700", "within 500", "500 taka" and a bare
 * currency-prefixed amount. Returns null rather than grabbing any digit — "for
 * 2" and "table for 4" must not become budgets.
 */
export function parseBudget(text: string): number | null {
  const ceiling =
    /(?:under|below|less than|max|maximum|up to|within|upto|no more than)\s*(?:৳|tk|bdt|rs|\$|aed|sar)?\s*(\d{2,5})/.exec(
      text,
    ) ?? /(?:৳|tk\.?|bdt|rs\.?|\$)\s*(\d{2,5})/.exec(text) ?? /(\d{2,5})\s*(?:taka|tk|bdt|৳)/.exec(text);
  if (!ceiling) return null;
  const value = Number(ceiling[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Head-count: "for two", "party of 6", "4 people". Capped at a sane party. */
export function parsePeople(text: string): number | null {
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  };
  const spelled = /for (one|two|three|four|five|six|seven|eight)\b/.exec(text);
  if (spelled) return words[spelled[1]];
  const digits = /(?:for|party of|group of)\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:people|persons|guests|of us)/.exec(
    text,
  );
  const value = Number(digits?.[1] ?? digits?.[2]);
  return Number.isFinite(value) && value >= 1 && value <= MAX_PARTY ? value : null;
}

/** A calorie ceiling: "under 600 calories", "600 kcal or less". */
function parseCalories(text: string): number | null {
  const match =
    /(?:under|below|less than|max|up to|within)\s*(\d{2,4})\s*(?:kcal|cal|calories)/.exec(text) ??
    /(\d{2,4})\s*(?:kcal|calories|cal)\b/.exec(text);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value >= 100 && value <= 3000 ? value : null;
}

/** True when the allergen is named *behind* an avoidance phrase. */
function isAvoided(text: string, words: string[]): boolean {
  return words.some((word) =>
    AVOID_PREFIXES.some((prefix) => text.includes(`${prefix}${word}`)),
  );
}

/** Longest-name-first, so "Bangkok House" wins over a vendor called "House". */
function longestMatch<T extends { name: string }>(text: string, list: T[]): T | null {
  const hits = list.filter((item) => item.name.length > 3 && text.includes(item.name.toLowerCase()));
  return hits.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

/**
 * Turn a sentence into constraints and an intent.
 *
 * Order of work matters: the *avoidance* pass runs before the *wants* pass, so
 * "no cheese" never reads as a request for cheese, and the intent is decided
 * last, once we know whether the sentence carried a budget, a mood or a diet —
 * a bare "under 500" is a budget search even though it names no food.
 */
export function parseRequest(
  input: string,
  vocab: ParseVocabulary = emptyVocabulary(),
): ParsedRequest {
  const text = normalise(input);
  const c = emptyConstraints();

  // ---- Avoidance (allergens) — must run before anything reads the same word.
  for (const allergen of ALLERGENS) {
    if (isAvoided(text, ALLERGEN_WORDS[allergen])) c.avoid.push(allergen);
  }
  for (const tag of ["vegan", "vegetarian", "gluten-free", "halal"] as DietaryTag[]) {
    if (has(text, DIETARY_WORDS[tag])) c.dietary.push(tag);
  }
  if (has(text, DIETARY_WORDS.keto)) c.dietary.push("keto");
  if (has(text, DIETARY_WORDS.healthy)) c.healthy = true;
  if (has(text, DIETARY_WORDS.spicy) && !isAvoided(text, DIETARY_WORDS.spicy)) c.spicy = true;

  // ---- Money, calories, party size
  c.maxPrice = parseBudget(text);
  if (c.maxPrice === null && has(text, CHEAP_WORDS)) c.maxPrice = CHEAP_CEILING;
  c.maxCalories = parseCalories(text);
  c.people = parsePeople(text);
  // A budget stated for a table is a table budget; the dish ceiling is a share.
  if (c.maxPrice !== null && c.people && c.people > 1) {
    c.maxPrice = Math.round(c.maxPrice / c.people);
  }

  // ---- Mood
  for (const [key, rule] of Object.entries(MOODS) as [Mood, MoodRule][]) {
    if (has(text, rule.keywords)) {
      c.mood = key;
      break;
    }
  }
  if (c.mood && MOODS[c.mood].maxPrice && c.maxPrice === null) {
    c.maxPrice = MOODS[c.mood].maxPrice;
  }

  // ---- Where from
  for (const [type, words] of Object.entries(VENDOR_TYPE_WORDS) as [VendorType, string[]][]) {
    if (has(text, words)) {
      c.vendorType = type;
      break;
    }
  }
  if (has(text, ["open now", "still open", "open right now", "খোলা", "مفتوح"])) c.openNow = true;

  // ---- Catalogue entities (the seam's vocabulary)
  const cuisine = longestMatch(text, vocab.cuisines);
  if (cuisine) c.cuisineSlug = cuisine.slug;
  const category = vocab.categories.find(
    (cat) => text.includes(cat.name.toLowerCase()) || has(text, cat.keywords.map((k) => k.toLowerCase())),
  );
  if (category) c.categorySlug = category.slug;
  const vendor = longestMatch(text, vocab.vendors);
  if (vendor) c.vendorId = vendor.id;
  const food = longestMatch(text, vocab.foods);
  if (food) c.foodId = food.id;

  // ---- Free-text terms: whatever is left that could name a dish.
  const tokens = text.split(" ").filter(Boolean);
  const terms = tokens.filter((token) => token.length > 2 && !STOPWORDS.has(token) && !/^\d+$/.test(token));

  // ---- Intent, decided last so it can see the constraints.
  let intent: AssistantIntent = "unknown";
  for (const [candidate, words] of INTENT_WORDS) {
    if (has(text, words)) {
      intent = candidate;
      break;
    }
  }
  if (intent === "unknown") {
    if (c.mood) intent = "mood";
    else if (c.maxPrice !== null && !terms.length) intent = "budget";
    else if (c.vendorType || has(text, ["restaurant", "place", "spot", "kitchen", "where should i"]))
      intent = "find-vendor";
    else if (terms.length || c.categorySlug || c.cuisineSlug || c.dietary.length) intent = "find-dish";
    else intent = "recommend";
  }
  // "Is the diavola safe for me?" is an allergy question about a named dish;
  // "no peanuts" alongside a want is a constraint on a normal search.
  if (intent === "allergy" && !c.foodId && !c.avoid.length && !terms.length) intent = "recommend";

  return { intent, terms, constraints: c, confidence: confidenceOf(text, tokens, terms, c, intent) };
}

/**
 * How much of the sentence we actually accounted for: every token that was a
 * stopword, a number, or part of something we recognised counts as understood.
 * A sentence of unknown nouns scores low and the assistant says so.
 */
function confidenceOf(
  text: string,
  tokens: string[],
  terms: string[],
  c: RequestConstraints,
  intent: AssistantIntent,
): number {
  if (!tokens.length) return 0;
  const recognised =
    Number(c.mood !== null) +
    Number(c.maxPrice !== null) +
    Number(c.maxCalories !== null) +
    Number(c.categorySlug !== null) +
    Number(c.cuisineSlug !== null) +
    Number(c.vendorId !== null) +
    Number(c.foodId !== null) +
    Number(c.vendorType !== null) +
    c.dietary.length +
    c.avoid.length;

  const understoodTokens = tokens.length - terms.length; // stopwords + numbers
  const base = understoodTokens / tokens.length;
  const signal = Math.min(0.6, recognised * 0.2);
  // A recognised intent phrase is itself strong evidence, whatever the nouns.
  const intentBonus = intent === "unknown" ? 0 : text.length < 24 ? 0.25 : 0.15;
  return Math.min(1, Math.round((base * 0.4 + signal + intentBonus) * 100) / 100);
}

// ─── Constraints → search ────────────────────────────────────────────────────

/**
 * The parse expressed as a `/search` URL. This is the "AI Search" feature in
 * one function: the assistant's understanding is *nothing but* the search
 * page's own facets, so anything it can answer is also a link the customer can
 * open, share and refine by hand.
 */
export function searchHref(parsed: ParsedRequest): string {
  const params = new URLSearchParams();
  const { constraints: c } = parsed;
  if (parsed.terms.length) params.set("q", parsed.terms.join(" "));
  if (c.categorySlug) params.set("category", c.categorySlug);
  if (c.cuisineSlug) params.set("cuisine", c.cuisineSlug);
  if (c.vendorType) params.set("type", c.vendorType);
  for (const tag of dietaryFilters(c)) params.append("diet", tag);
  if (c.openNow) params.set("open", "1");
  if (c.mood && MOODS[c.mood].maxEta) params.set("eta", String(MOODS[c.mood].maxEta));
  // The search page's price facet is a 1–4 price level, not an amount: map the
  // ceiling onto the band it falls in rather than inventing a new facet.
  if (c.maxPrice !== null) params.set("price", String(priceLevelFor(c.maxPrice)));
  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}

/** Dietary tags the parse asks a dish to carry (mood-implied tags included). */
export function dietaryFilters(c: RequestConstraints): DietaryTag[] {
  const tags = new Set<DietaryTag>(c.dietary);
  if (c.healthy) tags.add("healthy");
  if (c.mood) for (const tag of MOODS[c.mood].dietary) tags.add(tag);
  return [...tags];
}

/** A per-dish ceiling in BDT mapped onto the catalogue's 1–4 price level. */
export function priceLevelFor(maxPrice: number): 1 | 2 | 3 | 4 {
  if (maxPrice <= 300) return 1;
  if (maxPrice <= 600) return 2;
  if (maxPrice <= 1000) return 3;
  return 4;
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

/** What this device knows about the customer, folded into the ranking. */
export interface RankSignals {
  recentVendorIds: string[];
  recentFoodIds: string[];
  favoriteVendorIds: string[];
  favoriteFoodIds: string[];
  avoid: Allergen[];
}

export function emptySignals(): RankSignals {
  return {
    recentVendorIds: [],
    recentFoodIds: [],
    favoriteVendorIds: [],
    favoriteFoodIds: [],
    avoid: [],
  };
}

/**
 * The hard filter: everything a dish must satisfy to be *offered at all*.
 *
 * Allergens and dietary tags are absolute — an allergy is not a preference to
 * be outranked — while price and calories are ceilings. Anything softer (mood,
 * free text, popularity) belongs in {@link scoreDish}, so a thin result set
 * degrades into "less relevant" rather than "nothing found".
 */
export function matchesConstraints(
  food: FoodItem,
  vendor: Vendor,
  parsed: ParsedRequest,
  avoid: Allergen[],
): boolean {
  const c = parsed.constraints;
  if (!food.isAvailable || food.deletedAt) return false;
  if (allergenConflicts(food, avoid).length) return false;
  for (const tag of dietaryFilters(c)) {
    if (!food.dietary.includes(tag)) return false;
  }
  if (c.maxPrice !== null && food.price > c.maxPrice) return false;
  if (c.maxCalories !== null && (food.calories ?? 0) > c.maxCalories) return false;
  if (c.spicy && food.spicyLevel === 0) return false;
  if (c.vendorType && vendor.type !== c.vendorType) return false;
  if (c.vendorId && food.vendorId !== c.vendorId) return false;
  return true;
}

/** How many of `words` appear in a dish's name or description. */
function keywordHits(food: FoodItem, words: string[]): number {
  const text = `${food.name} ${food.description}`.toLowerCase();
  return words.reduce((n, word) => (text.includes(word) ? n + 1 : n), 0);
}

/**
 * Relevance for a dish. Same shape as the search page's `foodScore` — name hits
 * beat description hits, popularity breaks ties — plus the two things search
 * has no notion of: the mood's dish words, and what this customer has actually
 * ordered and saved.
 */
export function scoreDish(
  food: FoodItem,
  vendor: Vendor,
  parsed: ParsedRequest,
  signals: RankSignals,
): number {
  const c = parsed.constraints;
  const name = food.name.toLowerCase();
  const description = food.description.toLowerCase();
  let score = food.rating * 4;

  for (const term of parsed.terms) {
    if (name === term) score += 100;
    else if (name.startsWith(term)) score += 60;
    else if (name.includes(term)) score += 45;
    if (description.includes(term)) score += 12;
  }

  if (c.mood) {
    const rule = MOODS[c.mood];
    score += Math.min(3, keywordHits(food, rule.prefer)) * 22;
    score -= keywordHits(food, rule.avoid) * 18;
  }
  if (c.foodId === food.id) score += 120;
  if (food.isPopular) score += 12;
  if (c.spicy && food.spicyLevel > 0) score += food.spicyLevel * 6;
  if (c.healthy && food.dietary.includes("healthy")) score += 20;
  if (c.maxPrice !== null) {
    // Prefer dishes that use the budget rather than the cheapest thing listed.
    score += 14 * (1 - Math.abs(c.maxPrice - food.price) / Math.max(c.maxPrice, 1));
  }
  if (vendor.isOpen) score += 6;
  if (vendor.isFeatured) score += 4;

  // Personalisation — only ever reaches here when the customer allowed it.
  if (signals.favoriteFoodIds.includes(food.id)) score += 30;
  if (signals.recentFoodIds.includes(food.id)) score += 20;
  if (signals.favoriteVendorIds.includes(vendor.id)) score += 14;
  if (signals.recentVendorIds.includes(vendor.id)) score += 10;

  return score;
}

/** Relevance for a restaurant — the same idea, one level up. */
export function scoreVendor(
  vendor: Vendor,
  parsed: ParsedRequest,
  signals: RankSignals,
): number {
  const c = parsed.constraints;
  const name = vendor.name.toLowerCase();
  const tagline = `${vendor.tagline} ${vendor.description}`.toLowerCase();
  let score = vendor.rating * 8;

  for (const term of parsed.terms) {
    if (name === term) score += 100;
    else if (name.includes(term)) score += 50;
    if (tagline.includes(term)) score += 14;
  }
  if (c.vendorId === vendor.id) score += 120;
  if (c.vendorType && vendor.type === c.vendorType) score += 25;
  if (c.openNow && !vendor.isOpen) score -= 200;
  if (vendor.isOpen) score += 10;
  if (vendor.isFeatured) score += 8;
  if (vendor.isTrending) score += 5;
  if (c.mood === "quick") score -= vendor.etaMinutes[0];
  if (c.maxPrice !== null && vendor.priceLevel > priceLevelFor(c.maxPrice)) score -= 40;

  if (signals.favoriteVendorIds.includes(vendor.id)) score += 35;
  if (signals.recentVendorIds.includes(vendor.id)) score += 25;

  return score;
}

// ─── Review summary ──────────────────────────────────────────────────────────

/** Which verdict a rating earns. Keys resolve to `ai.verdict.<key>`. */
export function verdictKeyFor(average: number, count: number): string {
  if (count < 5) return "verdict.tooFew";
  if (average >= 4.6) return "verdict.loved";
  if (average >= 4.2) return "verdict.solid";
  if (average >= 3.5) return "verdict.mixed";
  return "verdict.poor";
}

/**
 * Turn a vendor's review corpus into themes.
 *
 * Every number here is one the C22 aggregate already computed — this adds no
 * new statistics, it only decides *which* of them are worth saying. That is the
 * honest version of a "summary": praise is the positive tags people kept using,
 * gripes are the negative ones, and an aspect is only mentioned when enough
 * reviews scored it to mean anything.
 */
export function summariseReviews(
  vendorId: string,
  summary: ReviewSummary,
  positiveTags: readonly string[],
  lovedFoodIds: string[],
  limit = 3,
): AiReviewSummary {
  const positive = new Set(positiveTags);
  const praise = summary.topTags
    .filter((tag) => positive.has(tag.tag))
    .slice(0, limit)
    .map((tag) => tag.tag);
  const gripes = summary.topTags
    .filter((tag) => !positive.has(tag.tag))
    .slice(0, limit)
    .map((tag) => tag.tag);

  const aspects = (Object.entries(summary.aspects) as [ReviewAspect, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([aspect, score]) => ({ aspect, score: Math.round(score * 10) / 10 }));

  return {
    vendorId,
    reviewCount: summary.count,
    average: summary.average,
    verdictKey: verdictKeyFor(summary.average, summary.count),
    praise,
    gripes,
    aspects,
    lovedFoodIds: lovedFoodIds.slice(0, 3),
    recommendShare: summary.recommend,
  };
}

/** The single most-quotable review: highest-rated with actual words in it. */
export function pickQuote(reviews: Review[]): Review | null {
  const usable = reviews.filter((r) => r.comment.trim().length >= 40 && !r.deletedAt);
  if (!usable.length) return null;
  return usable.reduce((a, b) => (b.rating > a.rating ? b : a));
}

// ─── Recognition ─────────────────────────────────────────────────────────────

/**
 * FNV-1a over a string. The same trick `lib/delivery.otpFor` uses: a stable
 * number from stable input, so the "recognition" below is reproducible — upload
 * the same photo twice and the assistant says the same thing, which a random
 * pick would not.
 */
export function hashText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Identify a dish from a photo — or rather, from its *fingerprint*, because
 * there is no vision model here and the UI says so.
 *
 * What makes this more than a random pick: the filename is part of the
 * fingerprint and is also searched, so a photo actually named `biryani.jpg`
 * really does come back as biryani. Everything else is a deterministic draw
 * from the catalogue with a confidence that is honest about being a guess
 * (never above `MAX_GUESS_CONFIDENCE` unless the filename matched).
 */
const MAX_GUESS_CONFIDENCE = 0.72;

export function recogniseDish(
  fileName: string,
  fingerprint: string,
  pool: FoodItem[],
  mode: "dish" | "menu",
  vendorIdOf: (food: FoodItem) => string,
): RecognitionResult {
  if (!pool.length) return { mode, confidence: 0, foodIds: [], vendorId: null };

  const name = normalise(fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
  const nameMatches = pool.filter(
    (food) =>
      name.length > 2 &&
      (name.includes(food.name.toLowerCase()) ||
        food.name.toLowerCase().split(" ").some((word) => word.length > 3 && name.includes(word))),
  );

  const hash = hashText(fingerprint);
  const picked = nameMatches.length ? nameMatches[hash % nameMatches.length] : pool[hash % pool.length];
  const confidence = nameMatches.length
    ? 0.82 + (hash % 12) / 100
    : 0.41 + (hash % Math.round(MAX_GUESS_CONFIDENCE * 100 - 41)) / 100;

  if (mode === "menu") {
    // A menu card belongs to one kitchen: "read" the whole of that vendor's menu.
    const vendorId = vendorIdOf(picked);
    const sameVendor = pool.filter((food) => vendorIdOf(food) === vendorId).slice(0, 6);
    return {
      mode,
      confidence: Math.round(confidence * 100) / 100,
      foodIds: sameVendor.map((food) => food.id),
      vendorId,
    };
  }

  // Runners-up: the closest priced dishes, so "not this one?" offers plausible
  // corrections rather than three random dishes.
  const alternatives = pool
    .filter((food) => food.id !== picked.id)
    .sort((a, b) => Math.abs(a.price - picked.price) - Math.abs(b.price - picked.price))
    .slice(0, 3);

  return {
    mode,
    confidence: Math.round(confidence * 100) / 100,
    foodIds: [picked.id, ...alternatives.map((food) => food.id)],
    vendorId: vendorIdOf(picked),
  };
}
