import type { FoodItem } from "@/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/** Reused Unsplash dish photos, keyed by dish so seeds stay readable. */
const IMG = {
  bruschetta: "https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?auto=format&fit=crop&w=600&q=80",
  margherita: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80",
  pepperoni: "https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=600&q=80",
  carbonara: "https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=600&q=80",
  lasagna: "https://images.unsplash.com/photo-1619895092538-128341789043?auto=format&fit=crop&w=600&q=80",
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
  cheeseburger: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80",
  fries: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80",
  shake: "https://images.unsplash.com/photo-1541658016709-82535e94bc69?auto=format&fit=crop&w=600&q=80",
  edamame: "https://images.unsplash.com/photo-1622944925721-6c8f6f5b0f0e?auto=format&fit=crop&w=600&q=80",
  sushiRoll: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&q=80",
  nigiri: "https://images.unsplash.com/photo-1611143669185-af224c5e3252?auto=format&fit=crop&w=600&q=80",
  biryani: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80",
  kebab: "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80",
  curry: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80",
  tacos: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80",
  burrito: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80",
  nachos: "https://images.unsplash.com/photo-1582169296194-e4d644c48063?auto=format&fit=crop&w=600&q=80",
  latte: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=600&q=80",
  cappuccino: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=600&q=80",
  pancakes: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=600&q=80",
  croissant: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80",
  fish: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80",
  khichuri: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80",
  pitha: "https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=600&q=80",
  bowl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80",
  juice: "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?auto=format&fit=crop&w=600&q=80",
  springroll: "https://images.unsplash.com/photo-1548811256-1627d99055b7?auto=format&fit=crop&w=600&q=80",
  greencurry: "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=600&q=80",
  padthai: "https://images.unsplash.com/photo-1637806930600-37fa8892069d?auto=format&fit=crop&w=600&q=80",
  cake: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80",
  brownie: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80",
  cocoa: "https://images.unsplash.com/photo-1517578239113-b03992dcdd25?auto=format&fit=crop&w=600&q=80",
} as const;

type FoodSeed = Pick<
  FoodItem,
  "slug" | "vendorId" | "sectionId" | "name" | "description" | "image" | "price"
> &
  Partial<
    Pick<
      FoodItem,
      | "compareAtPrice"
      | "dietary"
      | "spicyLevel"
      | "calories"
      | "rating"
      | "reviewCount"
      | "isPopular"
      | "isAvailable"
      | "optionGroups"
    >
  >;

/** Fills the audit + default fields so each seed states only what's distinctive. */
const food = (seed: FoodSeed): FoodItem => ({
  compareAtPrice: null,
  dietary: [],
  spicyLevel: 0,
  calories: null,
  rating: 4.6,
  reviewCount: 0,
  isPopular: false,
  isAvailable: true,
  optionGroups: [],
  ...seed,
  id: `food_${seed.slug}`,
  ...base,
});

/** A common "choose your size" group reused by several items. */
const sizeGroup = (base: string) => ({
  id: `${base}_size`,
  name: "Size",
  required: true,
  min: 1,
  max: 1,
  options: [
    { id: `${base}_regular`, name: "Regular", priceDelta: 0 },
    { id: `${base}_large`, name: "Large", priceDelta: 120 },
  ],
});

/**
 * Food items — priced in BDT (integer, matching the default region). Each
 * references its vendor (`ven_*`) and section (`sec_*`). Popular flags and
 * ratings drive the "Popular" rail on the restaurant detail page.
 */
export const foods: FoodItem[] = [
  // ── Bella Napoli ──────────────────────────────────────────────
  food({ slug: "bruschetta-pomodoro", vendorId: "ven_bella_napoli", sectionId: "sec_bella_starters", name: "Bruschetta al Pomodoro", description: "Grilled sourdough, San Marzano tomato, basil and Sicilian olive oil.", image: IMG.bruschetta, price: 320, dietary: ["vegetarian"], calories: 280, rating: 4.6, reviewCount: 214 }),
  food({ slug: "pizza-margherita", vendorId: "ven_bella_napoli", sectionId: "sec_bella_pizzas", name: "Margherita DOP", description: "Fior di latte, San Marzano, fresh basil — the Naples classic.", image: IMG.margherita, price: 720, dietary: ["vegetarian"], calories: 850, rating: 4.9, reviewCount: 986, isPopular: true, optionGroups: [sizeGroup("marg")] }),
  food({ slug: "pizza-diavola", vendorId: "ven_bella_napoli", sectionId: "sec_bella_pizzas", name: "Diavola", description: "Spicy nduja, pepperoni, chilli and mozzarella.", image: IMG.pepperoni, price: 890, spicyLevel: 2, calories: 990, rating: 4.8, reviewCount: 642, isPopular: true, optionGroups: [sizeGroup("diav")] }),
  food({ slug: "spaghetti-carbonara", vendorId: "ven_bella_napoli", sectionId: "sec_bella_pasta", name: "Spaghetti Carbonara", description: "Guanciale, pecorino, egg yolk and cracked black pepper.", image: IMG.carbonara, price: 780, calories: 720, rating: 4.7, reviewCount: 431 }),
  food({ slug: "lasagna-bolognese", vendorId: "ven_bella_napoli", sectionId: "sec_bella_pasta", name: "Lasagna Bolognese", description: "Slow-cooked beef ragù layered with béchamel and parmesan.", image: IMG.lasagna, price: 820, compareAtPrice: 950, calories: 910, rating: 4.8, reviewCount: 377 }),

  // ── Burger Lab ────────────────────────────────────────────────
  food({ slug: "classic-smash", vendorId: "ven_burger_lab", sectionId: "sec_burger_burgers", name: "Classic Smash", description: "Double smashed beef, American cheese, pickles, house sauce, brioche.", image: IMG.burger, price: 450, dietary: ["halal"], calories: 680, rating: 4.8, reviewCount: 1520, isPopular: true, optionGroups: [{ id: "smash_addons", name: "Add-ons", required: false, min: 0, max: 3, options: [{ id: "smash_bacon", name: "Turkey bacon", priceDelta: 90 }, { id: "smash_cheese", name: "Extra cheese", priceDelta: 60 }, { id: "smash_patty", name: "Extra patty", priceDelta: 150 }] }] }),
  food({ slug: "bacon-blue", vendorId: "ven_burger_lab", sectionId: "sec_burger_burgers", name: "Smoky Blue", description: "Beef, blue cheese, caramelised onion and smoky mayo.", image: IMG.cheeseburger, price: 520, dietary: ["halal"], calories: 740, rating: 4.6, reviewCount: 612 }),
  food({ slug: "hand-cut-fries", vendorId: "ven_burger_lab", sectionId: "sec_burger_sides", name: "Hand-cut Fries", description: "Twice-cooked, sea salt, served with garlic aioli.", image: IMG.fries, price: 220, dietary: ["vegetarian"], calories: 420, rating: 4.7, reviewCount: 803, isPopular: true }),
  food({ slug: "salted-caramel-shake", vendorId: "ven_burger_lab", sectionId: "sec_burger_shakes", name: "Salted Caramel Shake", description: "Thick vanilla shake, salted caramel swirl, whipped cream.", image: IMG.shake, price: 320, dietary: ["vegetarian"], calories: 560, rating: 4.7, reviewCount: 448 }),

  // ── Sakura Sushi ──────────────────────────────────────────────
  food({ slug: "edamame", vendorId: "ven_sakura_sushi", sectionId: "sec_sakura_starters", name: "Truffle Edamame", description: "Steamed soybeans, truffle salt and yuzu zest.", image: IMG.edamame, price: 380, dietary: ["vegan", "gluten-free"], calories: 190, rating: 4.5, reviewCount: 121 }),
  food({ slug: "dragon-roll", vendorId: "ven_sakura_sushi", sectionId: "sec_sakura_rolls", name: "Dragon Roll", description: "Tempura prawn, eel, avocado, unagi glaze — 8 pieces.", image: IMG.sushiRoll, price: 980, calories: 520, rating: 4.9, reviewCount: 534, isPopular: true }),
  food({ slug: "spicy-tuna-roll", vendorId: "ven_sakura_sushi", sectionId: "sec_sakura_rolls", name: "Spicy Tuna Roll", description: "Bluefin tuna, sriracha mayo, cucumber, tobiko — 8 pieces.", image: IMG.sushiRoll, price: 860, spicyLevel: 2, calories: 460, rating: 4.7, reviewCount: 389, isPopular: true }),
  food({ slug: "salmon-nigiri", vendorId: "ven_sakura_sushi", sectionId: "sec_sakura_nigiri", name: "Salmon Nigiri", description: "Hand-pressed nigiri, Norwegian salmon — 2 pieces.", image: IMG.nigiri, price: 420, dietary: ["gluten-free"], calories: 140, rating: 4.8, reviewCount: 276 }),

  // ── Spice Route ───────────────────────────────────────────────
  food({ slug: "mutton-kacchi", vendorId: "ven_spice_route", sectionId: "sec_spice_biryani", name: "Mutton Kacchi Biryani", description: "Dhaka-style dum kacchi, tender mutton, fragrant basmati, aloo.", image: IMG.biryani, price: 480, dietary: ["halal", "spicy"], spicyLevel: 2, calories: 1020, rating: 4.9, reviewCount: 2870, isPopular: true }),
  food({ slug: "chicken-biryani", vendorId: "ven_spice_route", sectionId: "sec_spice_biryani", name: "Chicken Biryani", description: "Saffron basmati, marinated chicken, fried onion and raita.", image: IMG.biryani, price: 360, dietary: ["halal"], spicyLevel: 1, calories: 880, rating: 4.7, reviewCount: 1440, isPopular: true }),
  food({ slug: "seekh-kebab", vendorId: "ven_spice_route", sectionId: "sec_spice_kebabs", name: "Beef Seekh Kebab", description: "Char-grilled minced beef skewers with mint chutney — 4 pieces.", image: IMG.kebab, price: 320, dietary: ["halal", "spicy"], spicyLevel: 2, calories: 410, rating: 4.6, reviewCount: 512 }),
  food({ slug: "butter-chicken", vendorId: "ven_spice_route", sectionId: "sec_spice_curries", name: "Butter Chicken", description: "Tandoori chicken in a silky tomato-butter gravy.", image: IMG.curry, price: 420, dietary: ["halal"], spicyLevel: 1, calories: 620, rating: 4.7, reviewCount: 688 }),

  // ── El Taco Loco ──────────────────────────────────────────────
  food({ slug: "al-pastor-tacos", vendorId: "ven_el_taco", sectionId: "sec_taco_tacos", name: "Tacos al Pastor", description: "Marinated pork, pineapple, onion, coriander — 3 tacos.", image: IMG.tacos, price: 380, dietary: ["halal", "spicy"], spicyLevel: 2, calories: 520, rating: 4.7, reviewCount: 341, isPopular: true }),
  food({ slug: "carne-burrito", vendorId: "ven_el_taco", sectionId: "sec_taco_burritos", name: "Carne Asada Burrito", description: "Grilled steak, rice, black beans, guac, pico de gallo.", image: IMG.burrito, price: 460, dietary: ["halal"], spicyLevel: 1, calories: 780, rating: 4.6, reviewCount: 254, isPopular: true }),
  food({ slug: "loaded-nachos", vendorId: "ven_el_taco", sectionId: "sec_taco_sides", name: "Loaded Nachos", description: "Corn chips, queso, jalapeños, sour cream and guacamole.", image: IMG.nachos, price: 340, dietary: ["vegetarian", "spicy"], spicyLevel: 1, calories: 640, rating: 4.5, reviewCount: 187 }),

  // ── The Daily Grind ───────────────────────────────────────────
  food({ slug: "flat-white", vendorId: "ven_the_daily_grind", sectionId: "sec_grind_coffee", name: "Flat White", description: "Double ristretto, silky micro-foam, single-origin beans.", image: IMG.latte, price: 260, dietary: ["vegetarian"], calories: 120, rating: 4.8, reviewCount: 921, isPopular: true, optionGroups: [{ id: "fw_milk", name: "Milk", required: true, min: 1, max: 1, options: [{ id: "fw_dairy", name: "Dairy", priceDelta: 0 }, { id: "fw_oat", name: "Oat milk", priceDelta: 60 }, { id: "fw_almond", name: "Almond milk", priceDelta: 60 }] }] }),
  food({ slug: "cappuccino", vendorId: "ven_the_daily_grind", sectionId: "sec_grind_coffee", name: "Cappuccino", description: "Balanced espresso, steamed milk, velvet foam.", image: IMG.cappuccino, price: 240, dietary: ["vegetarian"], calories: 130, rating: 4.7, reviewCount: 654 }),
  food({ slug: "buttermilk-pancakes", vendorId: "ven_the_daily_grind", sectionId: "sec_grind_brunch", name: "Buttermilk Pancakes", description: "Fluffy stack, maple syrup, berries and whipped butter.", image: IMG.pancakes, price: 420, dietary: ["vegetarian"], calories: 560, rating: 4.8, reviewCount: 512, isPopular: true }),
  food({ slug: "almond-croissant", vendorId: "ven_the_daily_grind", sectionId: "sec_grind_bakery", name: "Almond Croissant", description: "Twice-baked, frangipane filling, toasted almonds.", image: IMG.croissant, price: 220, dietary: ["vegetarian"], calories: 380, rating: 4.6, reviewCount: 289 }),

  // ── Rehana's Kitchen ──────────────────────────────────────────
  food({ slug: "shorshe-ilish", vendorId: "ven_rehanas_kitchen", sectionId: "sec_rehana_meals", name: "Shorshe Ilish", description: "Hilsa in mustard gravy with steamed rice — a Bengali classic.", image: IMG.fish, price: 380, dietary: ["halal", "spicy"], spicyLevel: 2, calories: 640, rating: 4.9, reviewCount: 231, isPopular: true }),
  food({ slug: "bhuna-khichuri", vendorId: "ven_rehanas_kitchen", sectionId: "sec_rehana_meals", name: "Bhuna Khichuri", description: "Rainy-day comfort — spiced rice and lentils with beef bhuna.", image: IMG.khichuri, price: 320, dietary: ["halal"], spicyLevel: 1, calories: 720, rating: 4.8, reviewCount: 198, isPopular: true }),
  food({ slug: "homemade-pitha", vendorId: "ven_rehanas_kitchen", sectionId: "sec_rehana_sides", name: "Homemade Pitha (3 pcs)", description: "Steamed rice-flour dumplings with date molasses.", image: IMG.pitha, price: 180, dietary: ["vegetarian"], calories: 300, rating: 4.7, reviewCount: 96 }),

  // ── Green Bowl ────────────────────────────────────────────────
  food({ slug: "power-protein-bowl", vendorId: "ven_green_bowl", sectionId: "sec_green_bowls", name: "Power Protein Bowl", description: "Grilled chicken, quinoa, avocado, chickpeas, tahini drizzle.", image: IMG.bowl, price: 460, dietary: ["healthy", "gluten-free"], calories: 540, rating: 4.7, reviewCount: 312, isPopular: true }),
  food({ slug: "vegan-buddha-bowl", vendorId: "ven_green_bowl", sectionId: "sec_green_bowls", name: "Vegan Buddha Bowl", description: "Roasted sweet potato, kale, edamame, brown rice, miso dressing.", image: IMG.bowl, price: 420, dietary: ["vegan", "vegetarian", "healthy"], calories: 480, rating: 4.6, reviewCount: 204 }),
  food({ slug: "green-detox-juice", vendorId: "ven_green_bowl", sectionId: "sec_green_juices", name: "Green Detox", description: "Cold-pressed cucumber, apple, celery, spinach and ginger.", image: IMG.juice, price: 240, dietary: ["vegan", "gluten-free", "healthy"], calories: 110, rating: 4.5, reviewCount: 141 }),

  // ── Bangkok House ─────────────────────────────────────────────
  food({ slug: "thai-spring-rolls", vendorId: "ven_bangkok_house", sectionId: "sec_bangkok_starters", name: "Crispy Spring Rolls", description: "Vegetable spring rolls with sweet chilli dip — 4 pieces.", image: IMG.springroll, price: 280, dietary: ["vegetarian"], calories: 320, rating: 4.5, reviewCount: 168 }),
  food({ slug: "green-curry", vendorId: "ven_bangkok_house", sectionId: "sec_bangkok_curries", name: "Green Curry Chicken", description: "Coconut green curry, Thai basil, bamboo shoot, jasmine rice.", image: IMG.greencurry, price: 480, dietary: ["spicy", "gluten-free"], spicyLevel: 2, calories: 610, rating: 4.7, reviewCount: 423, isPopular: true }),
  food({ slug: "pad-thai", vendorId: "ven_bangkok_house", sectionId: "sec_bangkok_noodles", name: "Prawn Pad Thai", description: "Wok-tossed rice noodles, prawn, tamarind, peanut and lime.", image: IMG.padthai, price: 520, spicyLevel: 1, calories: 680, rating: 4.8, reviewCount: 556, isPopular: true }),

  // ── Sugar & Spoon ─────────────────────────────────────────────
  food({ slug: "red-velvet-slice", vendorId: "ven_sugar_spoon", sectionId: "sec_sugar_cakes", name: "Red Velvet Slice", description: "Moist red velvet with tangy cream-cheese frosting.", image: IMG.cake, price: 320, dietary: ["vegetarian"], calories: 480, rating: 4.8, reviewCount: 512, isPopular: true }),
  food({ slug: "fudge-brownie", vendorId: "ven_sugar_spoon", sectionId: "sec_sugar_pastries", name: "Salted Fudge Brownie", description: "Dense dark-chocolate brownie with flaky sea salt.", image: IMG.brownie, price: 220, compareAtPrice: 280, dietary: ["vegetarian"], calories: 420, rating: 4.9, reviewCount: 604, isPopular: true }),
  food({ slug: "belgian-hot-chocolate", vendorId: "ven_sugar_spoon", sectionId: "sec_sugar_drinks", name: "Belgian Hot Chocolate", description: "Single-origin 70% cocoa, steamed milk, marshmallows.", image: IMG.cocoa, price: 260, dietary: ["vegetarian"], calories: 340, rating: 4.7, reviewCount: 233 }),
];

export const foodById = new Map(foods.map((f) => [f.id, f]));
export const foodBySlug = new Map(foods.map((f) => [f.slug, f]));
export const foodsByVendor = foods.reduce<Record<string, FoodItem[]>>((acc, f) => {
  (acc[f.vendorId] ??= []).push(f);
  return acc;
}, {});
