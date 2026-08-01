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
  filter: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
  avoToast: "https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&w=600&q=80",
  toastie: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80",
  matcha: "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=600&q=80",
  mochi: "https://images.unsplash.com/photo-1607013251379-e6eecfffe234?auto=format&fit=crop&w=600&q=80",
  milkTea: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80",
  samosa: "https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=600&q=80",
  chowmein: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80",
  gyoza: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80",
  naanWrap: "https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=600&q=80",
  raita: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&q=80",
  penne: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=600&q=80",
  caesar: "https://images.unsplash.com/photo-1550317138-10000687a72b?auto=format&fit=crop&w=600&q=80",
  ramen: "https://images.unsplash.com/photo-1591814468924-caf88d1232e1?auto=format&fit=crop&w=600&q=80",
  hummus: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80",
  freekeh: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80",
  roshomalai: "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=600&q=80",
  grillPlatter: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=600&q=80",
  cinnamonBun: "https://images.unsplash.com/photo-1481391319762-47dff72954d9?auto=format&fit=crop&w=600&q=80",
  layerCake: "https://images.unsplash.com/photo-1607532941433-304659e8198a?auto=format&fit=crop&w=600&q=80",
  croffle: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=600&q=80",
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

  // ── Bean & Bloom ──────────────────────────────────────────────
  food({ slug: "bloom-flat-white", vendorId: "ven_bean_and_bloom", sectionId: "sec_bloom_espresso", name: "Guatemala Flat White", description: "Washed Huehuetenango, chocolate and orange, on a lever machine.", image: IMG.latte, price: 300, dietary: ["vegetarian"], calories: 120, rating: 4.9, reviewCount: 478, isPopular: true, optionGroups: [{ id: "bb_milk", name: "Milk", required: true, min: 1, max: 1, options: [{ id: "bb_dairy", name: "Dairy", priceDelta: 0 }, { id: "bb_oat", name: "Oat milk", priceDelta: 60 }] }] }),
  food({ slug: "bloom-cold-brew", vendorId: "ven_bean_and_bloom", sectionId: "sec_bloom_espresso", name: "18-Hour Cold Brew", description: "Ethiopian natural, steeped overnight, served over a single big cube.", image: IMG.filter, price: 320, dietary: ["vegan"], calories: 15, rating: 4.7, reviewCount: 219 }),
  food({ slug: "bloom-avocado-toast", vendorId: "ven_bean_and_bloom", sectionId: "sec_bloom_toasts", name: "Avocado & Dukkah Toast", description: "Smashed avocado on sourdough, dukkah, lemon and chilli oil.", image: IMG.avoToast, price: 480, dietary: ["vegan", "vegetarian", "healthy"], calories: 420, rating: 4.8, reviewCount: 304, isPopular: true }),
  food({ slug: "bloom-croffle", vendorId: "ven_bean_and_bloom", sectionId: "sec_bloom_toasts", name: "Maple Croffle", description: "Croissant dough pressed in a waffle iron, maple butter, sea salt.", image: IMG.croffle, price: 340, dietary: ["vegetarian"], calories: 460, rating: 4.6, reviewCount: 152 }),

  // ── The Reading Room ──────────────────────────────────────────
  food({ slug: "reading-filter-pot", vendorId: "ven_the_reading_room", sectionId: "sec_reading_filter", name: "Filter Coffee (Pot for Two)", description: "A full pot of the daily single origin, refilled once, free.", image: IMG.filter, price: 380, dietary: ["vegan"], calories: 10, rating: 4.7, reviewCount: 266, isPopular: true }),
  food({ slug: "reading-chai", vendorId: "ven_the_reading_room", sectionId: "sec_reading_filter", name: "Masala Chai", description: "Loose-leaf Assam simmered with cardamom, clove and ginger.", image: IMG.milkTea, price: 200, dietary: ["vegetarian"], calories: 140, rating: 4.6, reviewCount: 188 }),
  food({ slug: "reading-cheese-toastie", vendorId: "ven_the_reading_room", sectionId: "sec_reading_toasties", name: "Three-Cheese Toastie", description: "Cheddar, gruyère and mozzarella on buttered sourdough.", image: IMG.toastie, price: 420, dietary: ["vegetarian"], calories: 610, rating: 4.8, reviewCount: 341, isPopular: true }),

  // ── Matcha House ──────────────────────────────────────────────
  food({ slug: "matcha-ceremonial", vendorId: "ven_matcha_house", sectionId: "sec_matcha_drinks", name: "Ceremonial Matcha (Usucha)", description: "Uji first-harvest, whisked in a chawan and served plain.", image: IMG.matcha, price: 420, dietary: ["vegan", "healthy"], calories: 5, rating: 4.8, reviewCount: 197, isPopular: true }),
  food({ slug: "matcha-latte-iced", vendorId: "ven_matcha_house", sectionId: "sec_matcha_drinks", name: "Iced Matcha Latte", description: "Ceremonial-grade matcha over milk and ice, unsweetened by default.", image: IMG.matcha, price: 380, dietary: ["vegetarian"], calories: 180, rating: 4.7, reviewCount: 312, isPopular: true, optionGroups: [{ id: "ml_milk", name: "Milk", required: true, min: 1, max: 1, options: [{ id: "ml_dairy", name: "Dairy", priceDelta: 0 }, { id: "ml_oat", name: "Oat milk", priceDelta: 60 }, { id: "ml_soy", name: "Soy milk", priceDelta: 50 }] }] }),
  food({ slug: "matcha-daifuku", vendorId: "ven_matcha_house", sectionId: "sec_matcha_sweets", name: "Matcha Daifuku (2 pcs)", description: "Soft mochi around matcha cream and sweet red bean.", image: IMG.mochi, price: 320, dietary: ["vegetarian"], calories: 240, rating: 4.6, reviewCount: 124 }),

  // ── Cha Ghor ──────────────────────────────────────────────────
  food({ slug: "cha-malai", vendorId: "ven_cha_ghor", sectionId: "sec_cha_tea", name: "Malai Cha", description: "Strong brew finished with thick clotted cream. The house standard.", image: IMG.milkTea, price: 60, dietary: ["vegetarian"], calories: 180, rating: 4.7, reviewCount: 1840, isPopular: true }),
  food({ slug: "cha-masala", vendorId: "ven_cha_ghor", sectionId: "sec_cha_tea", name: "Masala Cha", description: "Copper-pot tea with cardamom, cinnamon and crushed ginger.", image: IMG.milkTea, price: 50, dietary: ["vegetarian"], calories: 130, rating: 4.6, reviewCount: 1212, isPopular: true }),
  food({ slug: "cha-singara", vendorId: "ven_cha_ghor", sectionId: "sec_cha_snacks", name: "Singara (2 pcs)", description: "Flaky pastry with spiced potato and peanut, fried to order.", image: IMG.samosa, price: 40, dietary: ["vegetarian", "spicy"], spicyLevel: 1, calories: 260, rating: 4.5, reviewCount: 962 }),

  // ── Wok This Way ──────────────────────────────────────────────
  food({ slug: "wok-chicken-chowmein", vendorId: "ven_wok_this_way", sectionId: "sec_wok_noodles", name: "Chicken Chow Mein", description: "High-heat wok noodles, chicken, cabbage and spring onion.", image: IMG.chowmein, price: 380, dietary: ["halal"], spicyLevel: 1, calories: 620, rating: 4.5, reviewCount: 731, isPopular: true }),
  food({ slug: "wok-drunken-noodles", vendorId: "ven_wok_this_way", sectionId: "sec_wok_noodles", name: "Drunken Noodles", description: "Wide rice noodles, Thai basil, bird's-eye chilli and beef.", image: IMG.padthai, price: 440, dietary: ["halal", "spicy"], spicyLevel: 3, calories: 700, rating: 4.6, reviewCount: 428, isPopular: true }),
  food({ slug: "wok-gyoza", vendorId: "ven_wok_this_way", sectionId: "sec_wok_sides", name: "Pan-fried Gyoza (5 pcs)", description: "Chicken and chive dumplings, crisp bottoms, ponzu dip.", image: IMG.gyoza, price: 300, dietary: ["halal"], calories: 340, rating: 4.5, reviewCount: 296 }),

  // ── Naan Stop ─────────────────────────────────────────────────
  food({ slug: "naan-seekh-wrap", vendorId: "ven_naan_stop", sectionId: "sec_naan_wraps", name: "Seekh Kebab Naan Wrap", description: "Clay-oven naan, beef seekh, onion salad and mint chutney.", image: IMG.naanWrap, price: 320, dietary: ["halal", "spicy"], spicyLevel: 2, calories: 680, rating: 4.6, reviewCount: 604, isPopular: true }),
  food({ slug: "naan-paneer-wrap", vendorId: "ven_naan_stop", sectionId: "sec_naan_wraps", name: "Paneer Tikka Naan Wrap", description: "Charred paneer, capsicum, onion and a smoky tomato chutney.", image: IMG.naanWrap, price: 300, dietary: ["vegetarian", "spicy"], spicyLevel: 2, calories: 610, rating: 4.5, reviewCount: 281, isPopular: true }),
  food({ slug: "naan-boondi-raita", vendorId: "ven_naan_stop", sectionId: "sec_naan_sides", name: "Boondi Raita", description: "Chilled whisked yoghurt with crisp gram-flour pearls and cumin.", image: IMG.raita, price: 120, dietary: ["vegetarian"], calories: 180, rating: 4.4, reviewCount: 143 }),

  // ── Pasta Pronto ──────────────────────────────────────────────
  food({ slug: "pronto-cacio-e-pepe", vendorId: "ven_pasta_pronto", sectionId: "sec_pronto_pasta", name: "Cacio e Pepe", description: "Fresh tonnarelli, pecorino romano and a lot of black pepper.", image: IMG.penne, price: 520, dietary: ["vegetarian"], calories: 640, rating: 4.7, reviewCount: 318, isPopular: true }),
  food({ slug: "pronto-arrabbiata", vendorId: "ven_pasta_pronto", sectionId: "sec_pronto_pasta", name: "Penne all'Arrabbiata", description: "Fresh penne, garlic, chilli and slow-reduced tomato.", image: IMG.penne, price: 460, dietary: ["vegan", "vegetarian", "spicy"], spicyLevel: 2, calories: 580, rating: 4.6, reviewCount: 254 }),
  food({ slug: "pronto-caesar", vendorId: "ven_pasta_pronto", sectionId: "sec_pronto_extras", name: "Little Gem Caesar", description: "Crisp gem lettuce, anchovy dressing, focaccia croutons.", image: IMG.caesar, price: 340, calories: 320, rating: 4.5, reviewCount: 167 }),

  // ── Bowl & Broth ──────────────────────────────────────────────
  food({ slug: "broth-tonkotsu", vendorId: "ven_bowl_and_broth", sectionId: "sec_broth_ramen", name: "12-Hour Tonkotsu Ramen", description: "Pork bone broth, chashu, ajitama and thin Hakata noodles.", image: IMG.ramen, price: 620, calories: 780, rating: 4.8, reviewCount: 512, isPopular: true }),
  food({ slug: "broth-vegan-shoyu", vendorId: "ven_bowl_and_broth", sectionId: "sec_broth_ramen", name: "Vegan Shoyu Ramen", description: "Shiitake-kombu broth, charred corn, greens and chilli oil.", image: IMG.ramen, price: 540, dietary: ["vegan", "vegetarian", "healthy"], calories: 560, rating: 4.7, reviewCount: 288, isPopular: true }),
  food({ slug: "broth-karaage", vendorId: "ven_bowl_and_broth", sectionId: "sec_broth_sides", name: "Chicken Karaage", description: "Twice-fried marinated chicken with yuzu mayo.", image: IMG.gyoza, price: 340, dietary: ["halal"], calories: 480, rating: 4.6, reviewCount: 201 }),

  // ── Nadia's Table ─────────────────────────────────────────────
  food({ slug: "nadia-mezze-platter", vendorId: "ven_nadias_table", sectionId: "sec_nadia_mezze", name: "Mezze Platter for Two", description: "Hummus, muhammara, labneh, makdous, olives and warm bread.", image: IMG.hummus, price: 780, dietary: ["vegetarian", "healthy"], calories: 720, rating: 4.9, reviewCount: 164, isPopular: true }),
  food({ slug: "nadia-muhammara", vendorId: "ven_nadias_table", sectionId: "sec_nadia_mezze", name: "Muhammara", description: "Roast red pepper and walnut dip with pomegranate molasses.", image: IMG.hummus, price: 320, dietary: ["vegan", "vegetarian"], spicyLevel: 1, calories: 280, rating: 4.8, reviewCount: 97 }),
  food({ slug: "nadia-freekeh-chicken", vendorId: "ven_nadias_table", sectionId: "sec_nadia_mains", name: "Freekeh with Chicken", description: "Smoked green wheat, slow-cooked chicken, toasted almonds.", image: IMG.freekeh, price: 620, dietary: ["halal", "healthy"], calories: 690, rating: 4.9, reviewCount: 132, isPopular: true }),

  // ── Mishtis by Ruma ───────────────────────────────────────────
  food({ slug: "ruma-roshomalai", vendorId: "ven_mishtis_by_ruma", sectionId: "sec_ruma_sweets", name: "Roshomalai (6 pcs)", description: "Soft chhena discs in thickened, cardamom-scented milk.", image: IMG.roshomalai, price: 420, dietary: ["vegetarian"], calories: 680, rating: 4.9, reviewCount: 302, isPopular: true }),
  food({ slug: "ruma-nolen-sondesh", vendorId: "ven_mishtis_by_ruma", sectionId: "sec_ruma_sweets", name: "Nolen Gur Sondesh (8 pcs)", description: "Date-palm jaggery sondesh, made only while the gur is in season.", image: IMG.pitha, price: 380, dietary: ["vegetarian"], calories: 520, rating: 4.8, reviewCount: 178, isPopular: true }),
  food({ slug: "ruma-chomchom", vendorId: "ven_mishtis_by_ruma", sectionId: "sec_ruma_sweets", name: "Porabari Chomchom (6 pcs)", description: "Dense syrup-soaked chomchom rolled in khoya crumb.", image: IMG.roshomalai, price: 360, dietary: ["vegetarian"], calories: 600, rating: 4.7, reviewCount: 121 }),

  // ── Chef Arif's Grill ─────────────────────────────────────────
  food({ slug: "arif-mixed-grill", vendorId: "ven_chef_arifs_grill", sectionId: "sec_arif_grill", name: "Mixed Charcoal Grill", description: "Beef boti, chicken tikka, seekh kebab and grilled onion, for two.", image: IMG.grillPlatter, price: 980, dietary: ["halal", "spicy"], spicyLevel: 2, calories: 1120, rating: 4.8, reviewCount: 118, isPopular: true }),
  food({ slug: "arif-beef-boti", vendorId: "ven_chef_arifs_grill", sectionId: "sec_arif_grill", name: "Beef Boti Kebab", description: "Overnight-marinated beef cubes, charred hard on the outside.", image: IMG.kebab, price: 520, dietary: ["halal", "spicy"], spicyLevel: 2, calories: 540, rating: 4.7, reviewCount: 86, isPopular: true }),

  // ── Tiffin by Shirin ──────────────────────────────────────────
  food({ slug: "shirin-fish-tiffin", vendorId: "ven_tiffin_by_shirin", sectionId: "sec_shirin_tiffin", name: "Fish Tiffin", description: "Rice, rui macher jhol, two vegetables and dal. Ordered the night before.", image: IMG.fish, price: 220, dietary: ["halal", "healthy"], spicyLevel: 1, calories: 720, rating: 4.7, reviewCount: 604, isPopular: true }),
  food({ slug: "shirin-chicken-tiffin", vendorId: "ven_tiffin_by_shirin", sectionId: "sec_shirin_tiffin", name: "Chicken Tiffin", description: "Rice, chicken jhal-fry, seasonal bhaji, dal and salad.", image: IMG.khichuri, price: 240, dietary: ["halal", "healthy"], spicyLevel: 1, calories: 760, rating: 4.6, reviewCount: 481, isPopular: true }),
  food({ slug: "shirin-veg-tiffin", vendorId: "ven_tiffin_by_shirin", sectionId: "sec_shirin_tiffin", name: "Vegetable Tiffin", description: "Rice, shukto, aloo posto, dal and a slice of lemon.", image: IMG.bowl, price: 180, dietary: ["vegetarian", "healthy"], calories: 620, rating: 4.5, reviewCount: 297 }),

  // ── Lola's Bakes ──────────────────────────────────────────────
  food({ slug: "lola-caramel-brownie", vendorId: "ven_lolas_bakes", sectionId: "sec_lola_cakes", name: "Salted Caramel Brownie", description: "Fudge brownie with a caramel seam and flaky salt on top.", image: IMG.brownie, price: 260, dietary: ["vegetarian"], calories: 460, rating: 4.9, reviewCount: 241, isPopular: true }),
  food({ slug: "lola-cinnamon-buns", vendorId: "ven_lolas_bakes", sectionId: "sec_lola_cakes", name: "Cinnamon Buns (4 pcs)", description: "Overnight-proved buns with cardamom sugar and cream-cheese glaze.", image: IMG.cinnamonBun, price: 520, dietary: ["vegetarian"], calories: 890, rating: 4.8, reviewCount: 187, isPopular: true }),
  food({ slug: "lola-celebration-cake", vendorId: "ven_lolas_bakes", sectionId: "sec_lola_cakes", name: "Celebration Cake (6-inch)", description: "Three-layer vanilla or chocolate cake. Order 48 hours ahead.", image: IMG.layerCake, price: 1800, dietary: ["vegetarian"], calories: 2400, rating: 4.9, reviewCount: 96, optionGroups: [{ id: "cake_flavour", name: "Flavour", required: true, min: 1, max: 1, options: [{ id: "cake_vanilla", name: "Vanilla & berry", priceDelta: 0 }, { id: "cake_choc", name: "Chocolate fudge", priceDelta: 0 }, { id: "cake_redvelvet", name: "Red velvet", priceDelta: 200 }] }] }),
];

export const foodById = new Map(foods.map((f) => [f.id, f]));
export const foodBySlug = new Map(foods.map((f) => [f.slug, f]));
export const foodsByVendor = foods.reduce<Record<string, FoodItem[]>>((acc, f) => {
  (acc[f.vendorId] ??= []).push(f);
  return acc;
}, {});
