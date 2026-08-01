import type {
  DietaryTag,
  MealPlan,
  MealSlot,
  PlanMeal,
  PlanTier,
  Weekday,
} from "@/types";
import { SEED_NOW } from "./cuisines";

/**
 * Meal-plan seed (Phase C15). A plan (`mpl_*`) belongs to a vendor (FK
 * `vendorId` → vendors.ts) and owns two child collections: purchasable tiers
 * (`ptr_*`) and a rotating weekly menu (`pml_*`), both keyed back by `planId`
 * exactly as foreign keys would be. Prices are in BDT to match the default
 * region, and the kitchens' delivery weeks are realistic for Dhaka — the tiffin
 * service runs Sunday–Thursday, the local work week.
 */

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/** Unsplash helper — reuses image ids already whitelisted by next.config. */
const u = (id: string, w: number) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

/** Macro tuple: [calories, protein g, carbs g, fat g]. */
type Macros = [number, number, number, number];

/** Compact constructor for a weekly-menu row — the seed reads as a menu. */
function meal(
  planId: string,
  day: Weekday,
  slot: MealSlot,
  name: string,
  description: string,
  [calories, protein, carbs, fat]: Macros,
  dietary: DietaryTag[] = [],
): PlanMeal {
  return {
    id: `pml_${planId.slice(4)}_${day}_${slot}`,
    planId,
    day,
    slot,
    name,
    description,
    nutrition: { calories, protein, carbs, fat },
    dietary,
    ...base,
  };
}

/** Compact constructor for a commitment tier. */
function tier(
  planId: string,
  key: string,
  name: string,
  cycle: PlanTier["cycle"],
  mealsPerDay: number,
  pricePerMeal: number,
  discountRate: number,
  isPopular = false,
): PlanTier {
  return {
    id: `ptr_${planId.slice(4)}_${key}`,
    planId,
    name,
    cycle,
    mealsPerDay,
    pricePerMeal,
    discountRate,
    isPopular,
    ...base,
  };
}

const WORK_WEEK: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
const DHAKA_WEEK: Weekday[] = ["sun", "mon", "tue", "wed", "thu"];
const SIX_DAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat"];

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const mealPlans: MealPlan[] = [
  {
    id: "mpl_lean_greens",
    vendorId: "ven_green_bowl",
    slug: "lean-and-green",
    name: "Lean & Green",
    tagline: "Calorie-counted bowls, twice a day",
    description:
      "A calorie-controlled plan built around lean protein, whole grains and a lot of vegetables. Every bowl is portioned to a 500–550 kcal target so a full day on the plan lands just under 1,100 kcal before your own breakfast.",
    image: u("1512621776951-a57141f2eefd", 800),
    cover: u("1490474418585-ba9bad8fd0ea", 1200),
    goal: "weight-loss",
    dietary: ["healthy", "halal"],
    deliveryDays: WORK_WEEK,
    slots: ["lunch", "dinner"],
    nutritionPerDay: { calories: 1048, protein: 84, carbs: 95, fat: 37 },
    highlights: [
      "Portioned to a daily calorie target, not guessed",
      "Macros printed on every container",
      "Rotating menu — no dish twice in a week",
    ],
    rating: 4.7,
    reviewCount: 412,
    currency: "BDT",
    countryCode: "BD",
    deliveryFeePerDay: 40,
    leadTimeDays: 2,
    skipCutoffHours: 18,
    isFeatured: true,
    ...base,
  },
  {
    id: "mpl_keto_reset",
    vendorId: "ven_green_bowl",
    slug: "keto-reset",
    name: "Keto Reset",
    tagline: "Under 30g net carbs a day",
    description:
      "A strict low-carb plan for anyone doing keto properly. Net carbs are capped per meal, fats come from olive oil, avocado and nuts rather than fried batter, and every dish is weighed so the day totals stay under 30g.",
    image: u("1607013251379-e6eecfffe234", 800),
    cover: u("1481833761820-0509d3217039", 1200),
    goal: "keto",
    dietary: ["keto", "gluten-free", "halal"],
    deliveryDays: WORK_WEEK,
    slots: ["lunch", "dinner"],
    nutritionPerDay: { calories: 1380, protein: 99, carbs: 23, fat: 100 },
    highlights: [
      "Net carbs capped and printed per meal",
      "No seed-oil frying, ever",
      "Two weeks of menus before anything repeats",
    ],
    rating: 4.6,
    reviewCount: 238,
    currency: "BDT",
    countryCode: "BD",
    deliveryFeePerDay: 40,
    leadTimeDays: 2,
    skipCutoffHours: 18,
    isFeatured: false,
    ...base,
  },
  {
    id: "mpl_protein_build",
    vendorId: "ven_bowl_and_broth",
    slug: "protein-build",
    name: "Protein Build",
    tagline: "Three meals, 175g of protein a day",
    description:
      "A full-day plan for people training hard six days a week. Breakfast, lunch and dinner are timed around a session, protein is weighed to 55–65g per meal, and carbs are front-loaded into the two meals around training.",
    image: u("1619895092538-128341789043", 800),
    cover: u("1517578239113-b03992dcdd25", 1200),
    goal: "muscle-gain",
    dietary: ["healthy", "halal"],
    deliveryDays: SIX_DAYS,
    slots: ["breakfast", "lunch", "dinner"],
    nutritionPerDay: { calories: 2647, protein: 174, carbs: 272, fat: 88 },
    highlights: [
      "55–65g of protein in every single meal",
      "Carbs timed around your session",
      "Portion size scales with your tier",
    ],
    rating: 4.8,
    reviewCount: 356,
    currency: "BDT",
    countryCode: "BD",
    deliveryFeePerDay: 40,
    leadTimeDays: 3,
    skipCutoffHours: 24,
    isFeatured: true,
    ...base,
  },
  {
    id: "mpl_daily_tiffin",
    vendorId: "ven_tiffin_by_shirin",
    slug: "everyday-bangla-tiffin",
    name: "Everyday Bangla Tiffin",
    tagline: "Home-cooked lunch at your desk by one",
    description:
      "The lunch your mother would pack, delivered to the office five days a week. Rice or ruti, a fish or chicken curry, a seasonal bhaji and dal — cooked the same morning in Shirin's kitchen and sent out in a steel tiffin carrier.",
    image: u("1596040033229-a9821ebd058d", 800),
    cover: u("1445116572660-236099ec97a0", 1200),
    goal: "balanced",
    dietary: ["halal"],
    deliveryDays: DHAKA_WEEK,
    slots: ["lunch"],
    nutritionPerDay: { calories: 822, protein: 43, carbs: 98, fat: 26 },
    highlights: [
      "Cooked the same morning, never reheated stock",
      "Steel tiffin carriers — collected and reused",
      "Delivery included in the price",
    ],
    rating: 4.9,
    reviewCount: 604,
    currency: "BDT",
    countryCode: "BD",
    deliveryFeePerDay: 0,
    leadTimeDays: 1,
    skipCutoffHours: 14,
    isFeatured: true,
    ...base,
  },
  {
    id: "mpl_family_dinner",
    vendorId: "ven_nadias_table",
    slug: "family-dinner-table",
    name: "Family Dinner Table",
    tagline: "Dinner for the whole table, cooked daily",
    description:
      "One less thing to think about at 7pm. Every evening a full dinner arrives — a main, a vegetable side, rice or bread and something to finish — portioned per person, so you order for as many people as sit down.",
    image: u("1541529086526-db283c563270", 800),
    cover: u("1455619452474-d2be8b1e70cd", 1200),
    goal: "family",
    dietary: ["halal"],
    deliveryDays: SIX_DAYS,
    slots: ["dinner"],
    nutritionPerDay: { calories: 958, protein: 51, carbs: 105, fat: 35 },
    highlights: [
      "Portioned per person — scale it to your table",
      "Kid-friendly option on every menu",
      "Arrives hot between six and eight",
    ],
    rating: 4.7,
    reviewCount: 287,
    currency: "BDT",
    countryCode: "BD",
    deliveryFeePerDay: 30,
    leadTimeDays: 2,
    skipCutoffHours: 12,
    isFeatured: false,
    ...base,
  },
  {
    id: "mpl_plant_forward",
    vendorId: "ven_rehanas_kitchen",
    slug: "plant-forward",
    name: "Plant-Forward",
    tagline: "Fully plant-based, twice a day",
    description:
      "Entirely plant-based lunches and dinners that do not feel like a compromise. Protein comes from dal, chickpeas, tofu and paneer alternatives, and every week's menu is built around what is actually in season at Karwan Bazar.",
    image: u("1512058564366-18510be2db19", 800),
    cover: u("1486427944299-d1955d23e34d", 1200),
    goal: "plant-based",
    dietary: ["vegan", "vegetarian", "healthy"],
    deliveryDays: WORK_WEEK,
    slots: ["lunch", "dinner"],
    nutritionPerDay: { calories: 1191, protein: 53, carbs: 172, fat: 35 },
    highlights: [
      "Zero animal products, including in the stocks",
      "Seasonal produce sourced weekly",
      "Compostable packaging throughout",
    ],
    rating: 4.5,
    reviewCount: 193,
    currency: "BDT",
    countryCode: "BD",
    deliveryFeePerDay: 30,
    leadTimeDays: 2,
    skipCutoffHours: 18,
    isFeatured: false,
    ...base,
  },
];

// ---------------------------------------------------------------------------
// Tiers — how long you commit for, and how many meals land per day
// ---------------------------------------------------------------------------

export const planTiers: PlanTier[] = [
  // Lean & Green
  tier("mpl_lean_greens", "taster", "Weekly taster", "weekly", 1, 340, 0),
  tier("mpl_lean_greens", "single", "Monthly · one a day", "monthly", 1, 320, 0.1),
  tier("mpl_lean_greens", "double", "Monthly · full day", "monthly", 2, 300, 0.15, true),

  // Keto Reset
  tier("mpl_keto_reset", "taster", "Weekly taster", "weekly", 1, 420, 0),
  tier("mpl_keto_reset", "single", "Monthly · one a day", "monthly", 1, 400, 0.1, true),
  tier("mpl_keto_reset", "double", "Monthly · full day", "monthly", 2, 380, 0.15),

  // Protein Build
  tier("mpl_protein_build", "taster", "Weekly taster", "weekly", 2, 380, 0),
  tier("mpl_protein_build", "double", "Monthly · two a day", "monthly", 2, 360, 0.12),
  tier("mpl_protein_build", "full", "Monthly · full day", "monthly", 3, 330, 0.2, true),

  // Everyday Bangla Tiffin
  tier("mpl_daily_tiffin", "taster", "One week", "weekly", 1, 220, 0),
  tier("mpl_daily_tiffin", "monthly", "One month", "monthly", 1, 200, 0.12, true),

  // Family Dinner Table
  tier("mpl_family_dinner", "taster", "One week", "weekly", 1, 280, 0),
  tier("mpl_family_dinner", "monthly", "One month", "monthly", 1, 260, 0.12, true),

  // Plant-Forward
  tier("mpl_plant_forward", "taster", "Weekly taster", "weekly", 1, 300, 0),
  tier("mpl_plant_forward", "single", "Monthly · one a day", "monthly", 1, 280, 0.1),
  tier("mpl_plant_forward", "double", "Monthly · full day", "monthly", 2, 260, 0.15, true),
];

// ---------------------------------------------------------------------------
// Weekly menus — one row per delivery day × slot
// ---------------------------------------------------------------------------

const leanGreens: PlanMeal[] = [
  meal("mpl_lean_greens", "mon", "lunch", "Grilled chicken & quinoa bowl", "Charred chicken breast, quinoa, roasted pumpkin and a lemon-tahini drizzle.", [520, 46, 48, 16], ["healthy", "halal"]),
  meal("mpl_lean_greens", "mon", "dinner", "Baked bhetki with greens", "Herb-baked bhetki fillet, garlicky spinach and a scoop of brown rice.", [530, 48, 44, 18], ["healthy", "halal"]),
  meal("mpl_lean_greens", "tue", "lunch", "Chickpea & feta salad bowl", "Chickpeas, cucumber, tomato, feta and mint with a red-wine vinaigrette.", [510, 26, 58, 20], ["vegetarian", "healthy"]),
  meal("mpl_lean_greens", "tue", "dinner", "Lemon-pepper chicken", "Sous-vide chicken thigh, steamed broccoli and sweet potato mash.", [540, 50, 46, 17], ["healthy", "halal"]),
  meal("mpl_lean_greens", "wed", "lunch", "Tuna & soba noodles", "Seared tuna, buckwheat soba, edamame and a sesame-ginger dressing.", [525, 44, 52, 15], ["healthy"]),
  meal("mpl_lean_greens", "wed", "dinner", "Turkey kofta & couscous", "Spiced turkey kofta over herbed couscous with a cucumber raita.", [535, 45, 50, 18], ["healthy", "halal"]),
  meal("mpl_lean_greens", "thu", "lunch", "Green goddess bowl", "Kale, avocado, roasted chickpeas, pepitas and a herbed yoghurt dressing.", [505, 24, 54, 22], ["vegetarian", "healthy"]),
  meal("mpl_lean_greens", "thu", "dinner", "Grilled prawn & cauliflower rice", "Chilli-lime prawns on cauliflower rice with charred asparagus.", [480, 44, 28, 19], ["healthy", "gluten-free"]),
  meal("mpl_lean_greens", "fri", "lunch", "Beef & barley bowl", "Slow-cooked lean beef, pearl barley, carrot and a horseradish yoghurt.", [545, 47, 52, 18], ["healthy", "halal"]),
  meal("mpl_lean_greens", "fri", "dinner", "Miso salmon & greens", "Miso-glazed salmon, pak choi and a small portion of brown rice.", [550, 45, 42, 22], ["healthy"]),
];

const ketoReset: PlanMeal[] = [
  meal("mpl_keto_reset", "mon", "lunch", "Steak & chimichurri", "Grass-fed sirloin, chimichurri and a charred courgette salad.", [720, 54, 11, 52], ["keto", "gluten-free", "halal"]),
  meal("mpl_keto_reset", "mon", "dinner", "Butter chicken, no rice", "Slow-simmered butter chicken with cauliflower rice and cucumber.", [690, 50, 13, 48], ["keto", "gluten-free", "halal"]),
  meal("mpl_keto_reset", "tue", "lunch", "Salmon & avocado plate", "Pan-seared salmon, smashed avocado and a lemon-dressed rocket salad.", [710, 48, 10, 54], ["keto", "gluten-free"]),
  meal("mpl_keto_reset", "tue", "dinner", "Chicken Caesar, no croutons", "Grilled chicken, cos lettuce, parmesan and an anchovy Caesar dressing.", [660, 52, 9, 46], ["keto", "gluten-free", "halal"]),
  meal("mpl_keto_reset", "wed", "lunch", "Lamb kofta & tzatziki", "Spiced lamb kofta, thick tzatziki and a tomato-cucumber salad.", [730, 50, 12, 55], ["keto", "gluten-free", "halal"]),
  meal("mpl_keto_reset", "wed", "dinner", "Prawn & courgette noodles", "Garlic-butter prawns over courgette noodles with toasted almonds.", [640, 46, 12, 45], ["keto", "gluten-free"]),
  meal("mpl_keto_reset", "thu", "lunch", "Egg & halloumi bowl", "Soft-boiled eggs, seared halloumi, olives and a herbed olive-oil dressing.", [680, 42, 11, 52], ["keto", "vegetarian", "gluten-free"]),
  meal("mpl_keto_reset", "thu", "dinner", "Beef bulgogi, cauli rice", "Sesame beef bulgogi over cauliflower rice with kimchi.", [700, 52, 14, 48], ["keto", "gluten-free", "halal"]),
  meal("mpl_keto_reset", "fri", "lunch", "Tandoori chicken salad", "Tandoori-spiced chicken thigh, mint chutney and a shaved cabbage salad.", [670, 53, 10, 46], ["keto", "gluten-free", "halal"]),
  meal("mpl_keto_reset", "fri", "dinner", "Baked cod & brown butter", "Cod fillet in brown butter with green beans and toasted hazelnuts.", [700, 47, 11, 52], ["keto", "gluten-free"]),
];

const proteinBuild: PlanMeal[] = [
  meal("mpl_protein_build", "mon", "breakfast", "Egg white & oat stack", "Six-egg-white omelette, steel-cut oats, banana and peanut butter.", [820, 58, 92, 22], ["healthy", "halal"]),
  meal("mpl_protein_build", "mon", "lunch", "Double chicken & rice", "Two grilled chicken breasts, jasmine rice, broccoli and a chilli sauce.", [980, 68, 104, 26], ["healthy", "halal"]),
  meal("mpl_protein_build", "mon", "dinner", "Beef mince & sweet potato", "Lean beef mince, mashed sweet potato and roasted green beans.", [880, 57, 82, 32], ["healthy", "halal"]),
  meal("mpl_protein_build", "tue", "breakfast", "Protein pancakes", "Oat-and-whey pancakes with Greek yoghurt and berries.", [790, 55, 96, 20], ["healthy", "vegetarian"]),
  meal("mpl_protein_build", "tue", "lunch", "Salmon poke bowl", "Salmon, sushi rice, edamame, avocado and a soy-sesame dressing.", [950, 60, 98, 34], ["healthy"]),
  meal("mpl_protein_build", "tue", "dinner", "Chicken shawarma plate", "Shawarma-spiced chicken, garlic sauce, pita and a fattoush salad.", [900, 62, 88, 30], ["healthy", "halal"]),
  meal("mpl_protein_build", "wed", "breakfast", "Shakshuka & sourdough", "Four eggs poached in spiced tomato with two slices of sourdough.", [760, 44, 78, 28], ["vegetarian"]),
  meal("mpl_protein_build", "wed", "lunch", "Beef & barley power bowl", "Braised beef, pearl barley, roast carrot and a yoghurt drizzle.", [960, 64, 100, 30], ["healthy", "halal"]),
  meal("mpl_protein_build", "wed", "dinner", "Grilled fish & mash", "Grilled kingfish, olive-oil mash and charred tenderstem broccoli.", [870, 58, 80, 30], ["healthy"]),
  meal("mpl_protein_build", "thu", "breakfast", "Greek yoghurt parfait", "High-protein yoghurt, granola, honey and toasted almonds.", [740, 48, 88, 22], ["vegetarian", "healthy"]),
  meal("mpl_protein_build", "thu", "lunch", "Chicken burrito bowl", "Chipotle chicken, black beans, rice, corn salsa and lime crema.", [970, 63, 106, 30], ["halal"]),
  meal("mpl_protein_build", "thu", "dinner", "Lamb & couscous", "Slow-braised lamb shoulder over herbed couscous with roast pepper.", [910, 59, 84, 34], ["halal"]),
  meal("mpl_protein_build", "fri", "breakfast", "Steak & eggs", "Minute steak, three eggs, sautéed mushroom and toasted rye.", [830, 60, 62, 36], ["halal"]),
  meal("mpl_protein_build", "fri", "lunch", "Teriyaki chicken & noodles", "Teriyaki chicken thigh, udon, pak choi and sesame.", [940, 61, 108, 26], ["halal"]),
  meal("mpl_protein_build", "fri", "dinner", "Prawn & chorizo rice", "Prawns, chicken chorizo, saffron rice and roasted red pepper.", [890, 56, 92, 30], ["halal"]),
  meal("mpl_protein_build", "sat", "breakfast", "Big breakfast bowl", "Scrambled eggs, chicken sausage, avocado, beans and grilled tomato.", [800, 52, 66, 36], ["halal"]),
  meal("mpl_protein_build", "sat", "lunch", "Butter chicken & rice", "Butter chicken with basmati, cucumber raita and a whole-wheat ruti.", [990, 62, 110, 32], ["halal"]),
  meal("mpl_protein_build", "sat", "dinner", "Beef stir-fry & rice", "Wok-fried beef, mixed peppers, jasmine rice and a black-bean sauce.", [900, 58, 96, 28], ["halal"]),
];

const dailyTiffin: PlanMeal[] = [
  meal("mpl_daily_tiffin", "sun", "lunch", "Ilish bhapa tiffin", "Steamed hilsa in mustard, plain rice, aloo bhaji and thin dal.", [820, 44, 98, 26], ["halal"]),
  meal("mpl_daily_tiffin", "mon", "lunch", "Murgir jhol tiffin", "Country chicken curry, rice, begun bhaji and masoor dal.", [790, 45, 96, 24], ["halal"]),
  meal("mpl_daily_tiffin", "tue", "lunch", "Rui macher jhol tiffin", "Light rohu curry, rice, dhundul bhaji and a wedge of lemon.", [760, 41, 94, 22], ["halal"]),
  meal("mpl_daily_tiffin", "wed", "lunch", "Beef bhuna tiffin", "Slow-bhuna beef, ruti or rice, shak bhaji and salad.", [860, 47, 92, 32], ["halal"]),
  meal("mpl_daily_tiffin", "thu", "lunch", "Khichuri & dim bhuna", "Bhuna khichuri with an egg bhuna, achar and a papor.", [880, 38, 108, 28], ["halal", "vegetarian"]),
];

const familyDinner: PlanMeal[] = [
  meal("mpl_family_dinner", "mon", "dinner", "Roast chicken dinner", "Herb-roasted chicken, buttered rice, garlic beans and a garden salad.", [900, 52, 96, 32], ["halal"]),
  meal("mpl_family_dinner", "tue", "dinner", "Kacchi biryani night", "Mutton kacchi with borhani and a salad — the whole-table favourite.", [1050, 54, 118, 40], ["halal"]),
  meal("mpl_family_dinner", "wed", "dinner", "Pasta & meatballs", "Beef meatballs in tomato sugo, penne and garlic bread.", [940, 46, 112, 32], ["halal"]),
  meal("mpl_family_dinner", "thu", "dinner", "Fish curry & rice", "Coconut fish curry, steamed rice, stir-fried greens and lime.", [860, 45, 98, 28], ["halal"]),
  meal("mpl_family_dinner", "fri", "dinner", "Chicken roast & polao", "Friday chicken roast with polao, salad and a sweet to finish.", [1020, 50, 116, 38], ["halal"]),
  meal("mpl_family_dinner", "sat", "dinner", "Grill night platter", "Mixed grill — chicken tikka, seekh kebab, naan and chutneys.", [980, 56, 92, 40], ["halal"]),
];

const plantForward: PlanMeal[] = [
  meal("mpl_plant_forward", "mon", "lunch", "Dal & seasonal shak", "Masoor dal, stir-fried seasonal greens, rice and a tomato chutney.", [580, 26, 88, 14], ["vegan", "vegetarian", "healthy"]),
  meal("mpl_plant_forward", "mon", "dinner", "Chickpea curry & ruti", "Slow-cooked chholar dal with two whole-wheat rutis and salad.", [600, 28, 82, 18], ["vegan", "vegetarian"]),
  meal("mpl_plant_forward", "tue", "lunch", "Tofu bhuna bowl", "Bhuna-spiced tofu, brown rice, roasted pumpkin and pickled onion.", [590, 32, 76, 18], ["vegan", "healthy"]),
  meal("mpl_plant_forward", "tue", "dinner", "Mixed vegetable khichuri", "Vegetable khichuri with begun bhaji and a green-chilli achar.", [610, 24, 96, 16], ["vegan", "vegetarian"]),
  meal("mpl_plant_forward", "wed", "lunch", "Peanut & soba salad", "Cold soba, shredded cabbage, edamame and a peanut-lime dressing.", [570, 27, 78, 18], ["vegan", "healthy"]),
  meal("mpl_plant_forward", "wed", "dinner", "Aloo-gobi & dal", "Cumin potato and cauliflower with tarka dal and rice.", [595, 22, 92, 17], ["vegan", "vegetarian"]),
  meal("mpl_plant_forward", "thu", "lunch", "Mediterranean mezze", "Hummus, falafel, tabbouleh, olives and warm flatbread.", [620, 26, 84, 22], ["vegan", "vegetarian"]),
  meal("mpl_plant_forward", "thu", "dinner", "Thai green vegetable curry", "Coconut green curry with tofu, aubergine and jasmine rice.", [600, 24, 88, 20], ["vegan", "gluten-free"]),
  meal("mpl_plant_forward", "fri", "lunch", "Rajma & brown rice", "Kidney beans slow-cooked in tomato with brown rice and kachumber.", [610, 30, 92, 15], ["vegan", "healthy"]),
  meal("mpl_plant_forward", "fri", "dinner", "Roast vegetable traybake", "Harissa-roasted roots, chickpeas, couscous and a tahini drizzle.", [580, 25, 86, 18], ["vegan", "healthy"]),
];

export const planMeals: PlanMeal[] = [
  ...leanGreens,
  ...ketoReset,
  ...proteinBuild,
  ...dailyTiffin,
  ...familyDinner,
  ...plantForward,
];

// ---------------------------------------------------------------------------
// Lookups (the indexes a database would provide)
// ---------------------------------------------------------------------------

export const mealPlanBySlug = new Map(mealPlans.map((plan) => [plan.slug, plan]));
export const mealPlanById = new Map(mealPlans.map((plan) => [plan.id, plan]));

export const planTiersByPlan: Record<string, PlanTier[]> = planTiers.reduce(
  (acc, t) => {
    (acc[t.planId] ??= []).push(t);
    return acc;
  },
  {} as Record<string, PlanTier[]>,
);

export const planMealsByPlan: Record<string, PlanMeal[]> = planMeals.reduce(
  (acc, m) => {
    (acc[m.planId] ??= []).push(m);
    return acc;
  },
  {} as Record<string, PlanMeal[]>,
);
