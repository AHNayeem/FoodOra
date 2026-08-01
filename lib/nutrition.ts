import type {
  Allergen,
  DietaryTag,
  DietPlanDay,
  DietPlanMeal,
  EstimateConfidence,
  FoodItem,
  MealSlot,
  NutritionEstimate,
  NutritionFacts,
  PlanGoal,
} from "@/types";
import { addDays, toDateKey } from "./dates";

/**
 * nutrition.ts — what a dish is made of, worked out from what we actually know
 * about it (Phase C24; spec: Nutrition Analysis, Calories/Protein/Carbs/Fat,
 * Allergy Warning, Diet Planner).
 *
 * The catalogue gives a dish a name, a description, a calorie count and a few
 * dietary tags. It does *not* give macros or allergens, and this file does not
 * pretend otherwise: it **infers** both, deterministically, and reports how
 * confident that inference is so the UI can label it an estimate. Writing
 * `protein: 32` into the seed would have been easier and would have been a lie —
 * a real platform gets those numbers declared by the kitchen, and Phase E adds
 * the columns while this inference stays as the fallback for the (many) menus
 * nobody has annotated.
 *
 * Everything here is pure and clock-free. The one place a date appears — the
 * planner's day keys — takes `nowMs` as an argument, the convention every
 * derived-schedule module in this codebase follows.
 */

// ─── Allergens ───────────────────────────────────────────────────────────────

/** Screening order — the list a warning is rendered in. */
export const ALLERGENS: readonly Allergen[] = [
  "gluten",
  "dairy",
  "eggs",
  "nuts",
  "peanuts",
  "soy",
  "shellfish",
  "fish",
  "sesame",
];

/**
 * What in a dish's name or description betrays each allergen. Substring matches
 * against a lower-cased haystack, so "breaded" catches gluten and "parmesan"
 * catches dairy without either being spelled out on the menu.
 *
 * Erring towards over-reporting is deliberate: a false "may contain dairy" is
 * an inconvenience, a missed one is an ambulance.
 */
const ALLERGEN_KEYWORDS: Record<Allergen, string[]> = {
  gluten: [
    "bread", "sourdough", "bun", "brioche", "pasta", "penne", "spaghetti", "noodle",
    "ramen", "chow mein", "pad thai", "lasagna", "pizza", "dough", "crust", "wrap",
    "tortilla", "naan", "roti", "paratha", "flour", "batter", "breaded", "crumbed",
    "croissant", "pancake", "waffle", "cake", "brownie", "cookie", "biscuit", "pastry",
    "toast", "toastie", "gyoza", "dumpling", "spring roll", "samosa", "croffle", "bun",
    "barley", "wheat", "seitan", "couscous", "freekeh", "pita",
  ],
  dairy: [
    "cheese", "mozzarella", "parmesan", "fior di latte", "cheddar", "feta", "paneer",
    "cream", "creamy", "butter", "buttery", "ghee", "milk", "yoghurt", "yogurt", "raita",
    "curd", "custard", "ice cream", "latte", "cappuccino", "mocha", "milkshake", "shake",
    "cheesecake", "ricotta", "mascarpone", "burrata", "alfredo", "carbonara", "malai",
    "roshomalai", "kheer", "condensed",
  ],
  eggs: [
    "egg", "omelette", "omelet", "frittata", "mayo", "mayonnaise", "aioli", "meringue",
    "custard", "carbonara", "hollandaise", "pancake", "waffle", "brioche", "tempura",
    "caesar",
  ],
  nuts: [
    "almond", "cashew", "pistachio", "walnut", "hazelnut", "pecan", "macadamia",
    "praline", "nutty", "badam", "kaju", "nougat", "marzipan",
  ],
  peanuts: ["peanut", "groundnut", "satay", "pad thai"],
  soy: [
    "soy", "soya", "tofu", "edamame", "miso", "teriyaki", "hoisin", "tempeh",
    "ponzu", "shoyu",
  ],
  shellfish: [
    "prawn", "shrimp", "crab", "lobster", "scampi", "squid", "calamari", "octopus",
    "mussel", "clam", "oyster", "chingri",
  ],
  fish: [
    "fish", "salmon", "tuna", "anchovy", "cod", "hilsa", "ilish", "rui", "bhetki",
    "sardine", "mackerel", "sashimi", "nigiri", "maki", "unagi", "bonito", "worcester",
    "caesar", "fish sauce", "nam pla",
  ],
  sesame: ["sesame", "tahini", "hummus", "za'atar", "halva", "til", "furikake", "gomashio"],
};

/**
 * Dietary tags that *rule an allergen out*. A vegan dish has no dairy, eggs,
 * fish or shellfish whatever its description says, so "creamy vegan curry" is
 * not flagged for milk — the tag is a vendor's declaration and outranks a guess
 * made from an adjective.
 */
const TAG_EXCLUDES: Partial<Record<DietaryTag, Allergen[]>> = {
  vegan: ["dairy", "eggs", "fish", "shellfish"],
  vegetarian: ["fish", "shellfish"],
  "gluten-free": ["gluten"],
};

/**
 * Lower-cased text every inference here reads: a dish's name, its description
 * and its slug.
 *
 * The slug earns its place. "Margherita DOP — fior di latte, San Marzano, fresh
 * basil" never says the word *pizza*, so a gluten screen run on the prose alone
 * would clear it — and a coeliac customer would be told a pizza was safe. Its
 * slug, `pizza-margherita`, does say it, because whoever wrote the menu named
 * the thing for what it is. Reading it costs nothing and closes a real hole.
 */
function haystack(food: FoodItem): string {
  return `${food.name} ${food.description} ${food.slug.replace(/-/g, " ")}`.toLowerCase();
}

/**
 * Allergens a dish's own words suggest it contains, minus anything its dietary
 * tags rule out. Returns them in {@link ALLERGENS} order so two dishes never
 * list the same set differently.
 */
export function detectAllergens(food: FoodItem): Allergen[] {
  const text = haystack(food);
  const excluded = new Set<Allergen>(
    food.dietary.flatMap((tag) => TAG_EXCLUDES[tag] ?? []),
  );
  return ALLERGENS.filter(
    (allergen) =>
      !excluded.has(allergen) &&
      ALLERGEN_KEYWORDS[allergen].some((keyword) => text.includes(keyword)),
  );
}

/** The allergens a dish carries that this customer asked to avoid. */
export function allergenConflicts(food: FoodItem, avoid: Allergen[]): Allergen[] {
  if (!avoid.length) return [];
  const present = new Set(detectAllergens(food));
  return avoid.filter((allergen) => present.has(allergen));
}

/** True when nothing on the avoid-list turned up in the dish. */
export function isSafeFor(food: FoodItem, avoid: Allergen[]): boolean {
  return allergenConflicts(food, avoid).length === 0;
}

// ─── Macros ──────────────────────────────────────────────────────────────────

/**
 * A dish class and the share of its energy that comes from each macro. The
 * shares sum to 1 in every row — that invariant is what lets
 * {@link estimateNutrition} convert them into grams that add back up to the
 * calories the seed states, instead of three unrelated guesses.
 *
 * Order matters: the first profile whose keywords hit wins, so the specific
 * classes (dessert, drink) are tried before the general ones (grain, mixed).
 */
interface MacroProfile {
  id: string;
  keywords: string[];
  /** Energy share from protein / carbs / fat. Must total 1. */
  split: [protein: number, carbs: number, fat: number];
  /** Calories to assume when the seed has none. */
  fallbackCalories: number;
}

const MACRO_PROFILES: MacroProfile[] = [
  {
    id: "drink",
    keywords: [
      "latte", "cappuccino", "espresso", "americano", "coffee", "filter", "tea",
      "matcha", "juice", "smoothie", "shake", "cocoa", "chocolate drink", "lassi",
      "lemonade", "soda",
    ],
    split: [0.12, 0.62, 0.26],
    fallbackCalories: 180,
  },
  {
    id: "dessert",
    keywords: [
      "cake", "brownie", "cookie", "pudding", "ice cream", "mochi", "cheesecake",
      "tiramisu", "pitha", "roshomalai", "kheer", "croffle", "cinnamon bun", "sweet",
      "dessert", "tart", "doughnut", "pastry",
    ],
    split: [0.06, 0.56, 0.38],
    fallbackCalories: 420,
  },
  {
    id: "salad",
    keywords: [
      "salad", "greens", "slaw", "poke", "buddha bowl", "garden", "caesar", "rocket",
    ],
    split: [0.22, 0.34, 0.44],
    fallbackCalories: 320,
  },
  {
    id: "fried",
    keywords: [
      "fried", "fries", "crispy", "tempura", "katsu", "nuggets", "wings", "pakora",
      "samosa", "spring roll", "chips", "batter", "breaded", "doughnut",
    ],
    split: [0.16, 0.36, 0.48],
    fallbackCalories: 560,
  },
  {
    id: "grill",
    keywords: [
      "grilled", "grill", "kebab", "tikka", "steak", "roast", "bbq", "skewer",
      "shashlik", "tandoori", "platter", "sashimi", "nigiri",
    ],
    split: [0.4, 0.16, 0.44],
    fallbackCalories: 520,
  },
  {
    id: "curry",
    keywords: [
      "curry", "korma", "masala", "bhuna", "rezala", "stew", "dal", "daal", "gravy",
      "green curry", "rendang", "goulash",
    ],
    split: [0.24, 0.32, 0.44],
    fallbackCalories: 600,
  },
  {
    id: "grain",
    keywords: [
      "rice", "biryani", "khichuri", "pasta", "penne", "spaghetti", "noodle", "ramen",
      "chow mein", "pad thai", "pizza", "burger", "sandwich", "wrap", "burrito",
      "toast", "bun", "roll", "lasagna", "couscous", "freekeh", "pancake",
    ],
    split: [0.18, 0.48, 0.34],
    fallbackCalories: 680,
  },
  {
    id: "soup",
    keywords: ["soup", "broth", "shorba", "chowder", "pho", "tom yum"],
    split: [0.26, 0.36, 0.38],
    fallbackCalories: 280,
  },
];

/** The class used when nothing matched — a plain mixed plate. */
const DEFAULT_PROFILE: MacroProfile = {
  id: "mixed",
  keywords: [],
  split: [0.22, 0.42, 0.36],
  fallbackCalories: 480,
};

/**
 * Dietary tags nudge the split after the class is chosen: a keto dish is the
 * same lasagna shape with the carbs traded for fat, and a vegan one loses some
 * protein to carbs. Deltas are applied to the protein/carbs/fat shares and then
 * renormalised, so the totals invariant survives.
 */
const TAG_DELTAS: Partial<Record<DietaryTag, [number, number, number]>> = {
  keto: [0.1, -0.3, 0.2],
  vegan: [-0.06, 0.08, -0.02],
  vegetarian: [-0.04, 0.05, -0.01],
  healthy: [0.06, 0.02, -0.08],
};

/** Energy per gram, the constants that turn a share back into grams. */
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

function pickProfile(text: string): MacroProfile {
  return (
    MACRO_PROFILES.find((profile) =>
      profile.keywords.some((keyword) => text.includes(keyword)),
    ) ?? DEFAULT_PROFILE
  );
}

/** Clamp to zero and renormalise so the three shares total 1 again. */
function normalise(split: [number, number, number]): [number, number, number] {
  const safe = split.map((value) => Math.max(0.02, value)) as [number, number, number];
  const total = safe[0] + safe[1] + safe[2];
  return [safe[0] / total, safe[1] / total, safe[2] / total];
}

/**
 * Estimate a dish's macros from its calories, its class and its tags.
 *
 * The grams are derived from energy shares rather than guessed independently,
 * so `4·protein + 4·carbs + 9·fat` lands back on the stated calorie count
 * (within rounding) — an estimate that contradicts the number printed beside it
 * is worse than no estimate at all.
 *
 * Confidence reports how much the guess rested on: a dish whose class was
 * recognised *and* whose calories are known is `high`; one that fell through to
 * the mixed profile with no calorie count is `low`.
 */
export function estimateNutrition(food: FoodItem): NutritionEstimate {
  const text = haystack(food);
  const profile = pickProfile(text);
  const matchedClass = profile.id !== DEFAULT_PROFILE.id;

  const delta = food.dietary.reduce<[number, number, number]>(
    (acc, tag) => {
      const d = TAG_DELTAS[tag];
      return d ? [acc[0] + d[0], acc[1] + d[1], acc[2] + d[2]] : acc;
    },
    [0, 0, 0],
  );
  const [pShare, cShare, fShare] = normalise([
    profile.split[0] + delta[0],
    profile.split[1] + delta[1],
    profile.split[2] + delta[2],
  ]);

  const caloriesEstimated = food.calories === null;
  const calories = food.calories ?? profile.fallbackCalories;

  const nutrition: NutritionFacts = {
    calories: Math.round(calories),
    protein: Math.round((calories * pShare) / KCAL_PER_G.protein),
    carbs: Math.round((calories * cShare) / KCAL_PER_G.carbs),
    fat: Math.round((calories * fShare) / KCAL_PER_G.fat),
  };

  const confidence: EstimateConfidence =
    matchedClass && !caloriesEstimated ? "high" : matchedClass || !caloriesEstimated ? "medium" : "low";

  return { nutrition, confidence, profile: profile.id, caloriesEstimated };
}

/** Add up any number of macro rows. The planner's day totals go through here. */
export function totalNutrition(list: NutritionFacts[]): NutritionFacts {
  return list.reduce<NutritionFacts>(
    (acc, n) => ({
      calories: acc.calories + n.calories,
      protein: acc.protein + n.protein,
      carbs: acc.carbs + n.carbs,
      fat: acc.fat + n.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Share of a day's calories each macro supplies, for the macro bar. */
export function macroShares(n: NutritionFacts): { protein: number; carbs: number; fat: number } {
  const fromMacros =
    n.protein * KCAL_PER_G.protein + n.carbs * KCAL_PER_G.carbs + n.fat * KCAL_PER_G.fat;
  if (fromMacros <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: (n.protein * KCAL_PER_G.protein) / fromMacros,
    carbs: (n.carbs * KCAL_PER_G.carbs) / fromMacros,
    fat: (n.fat * KCAL_PER_G.fat) / fromMacros,
  };
}

// ─── Diet planner ────────────────────────────────────────────────────────────

/**
 * Daily calories each goal aims at, and how that day is spread across the three
 * meals. Reference-adult figures, stated once here so the planner, the summary
 * line and the progress ring can never disagree about what "on target" means.
 */
export const GOAL_CALORIES: Record<PlanGoal, number> = {
  balanced: 2000,
  "weight-loss": 1500,
  "muscle-gain": 2600,
  keto: 1800,
  "plant-based": 1900,
  family: 2200,
};

/** How a day's calorie budget is split. Sums to 1. */
export const SLOT_SHARE: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.4,
  dinner: 0.35,
};

export const MEAL_SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "dinner"];

/** Dietary tags a goal implies, folded into the planner's filter. */
export const GOAL_DIETARY: Record<PlanGoal, DietaryTag[]> = {
  balanced: [],
  "weight-loss": ["healthy"],
  "muscle-gain": [],
  keto: ["keto"],
  "plant-based": ["vegan"],
  family: [],
};

/** The daily target: whatever the customer set, else the goal's default. */
export function targetCalories(goal: PlanGoal, override: number | null): number {
  if (override && override >= 800 && override <= 5000) return Math.round(override);
  return GOAL_CALORIES[goal];
}

/** A dish the planner may draw on, with its estimate already worked out. */
export interface PlannerCandidate {
  food: FoodItem;
  vendorId: string;
  nutrition: NutritionFacts;
  /** Which slots this dish is plausible for — see {@link slotsFor}. */
  slots: MealSlot[];
}

/**
 * Which meals a dish belongs to. Breakfast is the only slot with real rules
 * (nobody orders lasagna at 8am); lunch and dinner are open, and a dish light
 * enough for breakfast is still allowed at lunch.
 */
export function slotsFor(food: FoodItem): MealSlot[] {
  const text = haystack(food);
  const breakfastWords = [
    "pancake", "croissant", "toast", "omelette", "omelet", "egg", "granola", "porridge",
    "oat", "yoghurt", "yogurt", "coffee", "latte", "cappuccino", "smoothie", "juice",
    "bun", "croffle", "khichuri", "paratha", "pitha", "muesli", "bagel", "waffle",
  ];
  const isBreakfast = breakfastWords.some((word) => text.includes(word));
  const heavy = (food.calories ?? 0) > 900;
  const slots: MealSlot[] = [];
  if (isBreakfast && !heavy) slots.push("breakfast");
  slots.push("lunch", "dinner");
  return slots;
}

/**
 * Build one day: for each slot, take the candidate whose calories land closest
 * to that slot's share of the target, never repeating a dish or a vendor within
 * the day (a plan that orders three times from one kitchen is a menu, not a
 * plan).
 *
 * Greedy rather than optimal on purpose — the slots are filled in descending
 * order of calorie weight, so the meal with the most room to get wrong is
 * matched first, and the small slots absorb the leftover error.
 */
export function planDay(
  candidates: PlannerCandidate[],
  target: number,
  date: string,
  usedFoodIds: Set<string>,
): DietPlanDay {
  const meals: DietPlanMeal[] = [];
  const usedVendors = new Set<string>();
  const order = [...MEAL_SLOTS].sort((a, b) => SLOT_SHARE[b] - SLOT_SHARE[a]);

  for (const slot of order) {
    const want = target * SLOT_SHARE[slot];
    const pool = candidates.filter(
      (c) =>
        c.slots.includes(slot) && !usedFoodIds.has(c.food.id) && !usedVendors.has(c.vendorId),
    );
    // Fall back to allowing a repeat vendor before giving up on the slot: an
    // incomplete day is a worse answer than a day that visits one kitchen twice.
    const relaxed = pool.length
      ? pool
      : candidates.filter((c) => c.slots.includes(slot) && !usedFoodIds.has(c.food.id));
    if (!relaxed.length) continue;

    const best = relaxed.reduce((a, b) =>
      Math.abs(a.nutrition.calories - want) <= Math.abs(b.nutrition.calories - want) ? a : b,
    );
    usedFoodIds.add(best.food.id);
    usedVendors.add(best.vendorId);
    meals.push({
      slot,
      foodId: best.food.id,
      vendorId: best.vendorId,
      nutrition: best.nutrition,
    });
  }

  meals.sort((a, b) => MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot));
  return { date, meals, total: totalNutrition(meals.map((m) => m.nutrition)) };
}

/**
 * Build a run of days starting today. `usedFoodIds` is carried across days, so
 * a three-day plan is three different menus rather than the same one repeated —
 * and is released once the catalogue runs dry, which for a small kitchen it
 * will.
 */
export function planDays(
  candidates: PlannerCandidate[],
  target: number,
  days: number,
  nowMs: number,
): DietPlanDay[] {
  const used = new Set<string>();
  const out: DietPlanDay[] = [];
  for (let i = 0; i < days; i++) {
    if (used.size + MEAL_SLOTS.length > candidates.length) used.clear();
    out.push(planDay(candidates, target, toDateKey(addDays(new Date(nowMs), i)), used));
  }
  return out;
}

/** How far a day's total strays from its target, as a signed share (−1…+1). */
export function targetDrift(total: NutritionFacts, target: number): number {
  if (target <= 0) return 0;
  return (total.calories - target) / target;
}
