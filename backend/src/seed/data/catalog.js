/**
 * catalog.js — the browse taxonomy, copied from the frontend fixtures.
 *
 * Same rule as `data/reference.js`: **the seeder invents nothing.** Every row
 * below is a row the frontend already renders, so the live catalog's cuisine
 * grid and craving rail are the ones the prototype was designed against rather
 * than a plausible-looking substitute:
 *
 *   lib/mock/cuisines.ts    the eight cuisines, in their order
 *   lib/mock/categories.ts  the ten categories, their `sort` and their `keywords`
 *
 * ## Why this is reference data and not demo data
 *
 * `seed/reference.js` says what it does not do — "no restaurants, no menus, no
 * orders, no accounts" — and this does none of those. A cuisine has no owner, no
 * money and no lifecycle: it is a vocabulary term that `VendorCuisine` points at,
 * in the same way `TaxRule` is one that an order points at. A vendor *is* trade,
 * and there is still no vendor here.
 *
 * It is a **separate seeder** rather than eleven more tables in
 * `seedReferenceData` for one operational reason: §2's seeder is the one a
 * production deployment must run before anything works at all (`User.countryCode`
 * has nowhere to point without it), and keeping that surface exactly as module 1
 * verified it is worth more than the convenience of one command.
 *
 * ## `keywords`
 *
 * The frontend's `Category.keywords: string[]` is `CategoryKeyword` rows here —
 * `catalog.prisma` normalises them so search can index and score the terms, which
 * is what `CatalogService` does with them: a category tile resolves to the
 * vendors whose profile actually covers it, so "Pizza" never lists a sushi bar.
 * Terms are stored lower-cased, as the column's comment requires.
 *
 * `weight` is not in the frontend's array, and it is not invented here either:
 * every term gets the column's own default of 1. A tile whose first keyword
 * should outrank its fourth is a ranking decision with no product behind it yet.
 */

/** `lib/mock/cuisines.ts` — eight rows, `sort` from their position there. */
export const cuisines = [
  {
    slug: "italian",
    name: "Italian",
    emoji: "🍝",
    image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "american",
    name: "American",
    emoji: "🍔",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "japanese",
    name: "Japanese",
    emoji: "🍣",
    image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "indian",
    name: "Indian",
    emoji: "🍛",
    image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "mexican",
    name: "Mexican",
    emoji: "🌮",
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "bengali",
    name: "Bengali",
    emoji: "🐟",
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "thai",
    name: "Thai",
    emoji: "🍲",
    image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "desserts",
    name: "Desserts",
    emoji: "🍰",
    image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=600&q=80",
  },
].map((cuisine, index) => ({ ...cuisine, sort: index + 1 }));

/** `lib/mock/categories.ts` — ten rows, with their own `sort` and keywords. */
export const categories = [
  {
    slug: "pizza",
    name: "Pizza",
    emoji: "🍕",
    sort: 1,
    keywords: ["pizza", "margherita", "pepperoni", "italian"],
    image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "burgers",
    name: "Burgers",
    emoji: "🍔",
    sort: 2,
    keywords: ["burger", "smash", "cheeseburger", "american"],
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "sushi",
    name: "Sushi",
    emoji: "🍣",
    sort: 3,
    keywords: ["sushi", "nigiri", "roll", "sashimi", "japanese"],
    image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "biryani",
    name: "Biryani",
    emoji: "🍛",
    sort: 4,
    keywords: ["biryani", "kacchi", "pulao", "indian", "bengali"],
    image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "pasta",
    name: "Pasta",
    emoji: "🍝",
    sort: 5,
    keywords: ["pasta", "carbonara", "lasagna", "italian"],
    image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "tacos",
    name: "Tacos",
    emoji: "🌮",
    sort: 6,
    keywords: ["taco", "burrito", "nachos", "mexican"],
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "coffee",
    name: "Coffee",
    emoji: "☕",
    sort: 7,
    keywords: ["coffee", "latte", "cappuccino", "espresso", "cold brew"],
    image: "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "desserts",
    name: "Desserts",
    emoji: "🍰",
    sort: 8,
    keywords: ["cake", "dessert", "brownie", "pastry", "croissant", "pitha"],
    image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "healthy",
    name: "Healthy",
    emoji: "🥗",
    sort: 9,
    keywords: ["bowl", "salad", "juice", "healthy", "vegan", "protein"],
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80",
  },
  {
    slug: "ramen",
    name: "Ramen",
    emoji: "🍜",
    sort: 10,
    keywords: ["ramen", "noodle", "pad thai", "pho", "broth"],
    image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80",
  },
];

/** How many `category_keywords` rows the ten categories above amount to. */
export const categoryKeywordCount = categories.reduce((total, category) => total + category.keywords.length, 0);
