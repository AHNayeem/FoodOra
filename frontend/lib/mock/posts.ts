import type { BlogPost } from "@/frontend/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

const img = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

/** Authors, so bylines stay consistent across posts. */
const AUTHORS = {
  kitchen: {
    author: "The FoodOra Kitchen",
    authorRole: "Our editorial team, mostly ex-cooks",
    authorAvatar: "https://i.pravatar.cc/200?img=15",
  },
  leila: {
    author: "Leila Haddad",
    authorRole: "Writes about home cooking and the people doing it",
    authorAvatar: "https://i.pravatar.cc/200?img=32",
  },
  team: {
    author: "The FoodOra Team",
    authorRole: "Product and engineering",
    authorAvatar: "https://i.pravatar.cc/200?img=11",
  },
  rina: {
    author: "Rina Chowdhury",
    authorRole: "Former restaurant GM, now writes about the business of food",
    authorAvatar: "https://i.pravatar.cc/200?img=45",
  },
  omar: {
    author: "Omar Siddique",
    authorRole: "Covers delivery, logistics and the people on the bikes",
    authorAvatar: "https://i.pravatar.cc/200?img=12",
  },
} as const;

/**
 * Blog posts — the editorial content behind `/blog` and `/blog/[slug]`, and the
 * teasers on the landing page. Human-authored copy lives on the entity as data
 * (this is what the CMS will own); only the surrounding UI chrome is translated.
 * `slug` is stable so URLs survive the move to a real CMS.
 */
export const posts: BlogPost[] = [
  {
    id: "post_street-food",
    slug: "street-food-guide-dhaka",
    title: "A first-timer's guide to Dhaka street food",
    excerpt:
      "From fuchka carts to late-night kebab rolls — the ten bites you can now order without leaving your seat.",
    cover: img("photo-1601050690597-df0568f70950"),
    category: "Guides",
    ...AUTHORS.kitchen,
    readMinutes: 6,
    publishedAt: "2026-07-10T09:00:00.000Z",
    tags: ["Dhaka", "Street food", "Guides"],
    body: [
      {
        type: "paragraph",
        text: "Dhaka's street food is not one cuisine. It is a dozen overlapping ones, sold from carts that appear at four in the afternoon and are gone by midnight, each specialising so narrowly that a stall selling both fuchka and kebab is a stall you should probably walk past.",
      },
      {
        type: "paragraph",
        text: "The good news for anyone reading this from an office chair is that most of it now travels. Not all of it — we will get to the exceptions — but enough that you can build a genuinely good evening without standing anywhere.",
      },
      { type: "heading", text: "Start with fuchka, and be specific" },
      {
        type: "paragraph",
        text: "Fuchka is the entry point and the thing most often done badly. The shell has to be crisp enough to shatter, which means it cannot sit in its filling for twenty minutes. Order it from a kitchen that packs the shells, the mash and the tamarind water separately, and assemble at your desk. It takes ten seconds and it is the difference between the real thing and a soggy tragedy.",
      },
      { type: "heading", text: "The things that travel best" },
      {
        type: "list",
        items: [
          "Beef seekh kebab — improves slightly on the trip, as the fat settles.",
          "Chicken roll, wrapped tight in paper rather than foil, so it does not steam.",
          "Bhuna khichuri, which is essentially built for a container.",
          "Jhal muri, if and only if the puffed rice is bagged apart from the wet ingredients.",
          "Any pitha with molasses on the side rather than poured over.",
        ],
      },
      {
        type: "quote",
        text: "If a stall sells one thing and has done for twenty years, order that thing. The menu is not a menu, it is a claim.",
        cite: "Every Dhaka food writer, eventually",
      },
      { type: "heading", text: "And the things that do not" },
      {
        type: "paragraph",
        text: "Anything deep-fried and thin — papri, thin puri, some singara — is a race against condensation you will lose. Order those when you are actually standing at the cart. Same for hot jilapi, which needs to be eaten within about ninety seconds of leaving the syrup.",
      },
      {
        type: "paragraph",
        text: "The rest of it, though, is yours. Start at Cha Ghor for the tea, work through a kebab or two, and finish with mishti from a home kitchen that made it that morning. It is a better evening than most restaurants can put together.",
      },
    ],
    ...base,
  },
  {
    id: "post_home-chefs",
    slug: "meet-the-home-chefs",
    title: "Meet the home chefs cooking your next favourite meal",
    excerpt:
      "Behind every home-kitchen listing is a person and a recipe. We sat down with three of the most-loved.",
    cover: img("photo-1556910103-1c02745aae4d"),
    category: "Community",
    ...AUTHORS.leila,
    readMinutes: 8,
    publishedAt: "2026-07-03T09:00:00.000Z",
    tags: ["Home chefs", "Community", "Interviews"],
    body: [
      {
        type: "paragraph",
        text: "There are just over six hundred verified home kitchens on FoodOra. Almost none of them set out to run a business. They set out to cook one dish properly for people who would appreciate it, and the business arrived afterwards, usually uninvited.",
      },
      { type: "heading", text: "Rehana, who cooks what the weather asks for" },
      {
        type: "paragraph",
        text: "Rehana's menu changes when it rains. Khichuri appears, the fish changes, the portions get bigger. She does not announce it; regulars simply know that a wet Tuesday means something different from a dry one.",
      },
      {
        type: "quote",
        text: "I cook for about forty people a week. If it were four hundred it would not be my food any more, it would be a factory with my name on it.",
        cite: "Rehana, Rehana's Kitchen",
      },
      { type: "heading", text: "Nadia, and the recipes that travelled" },
      {
        type: "paragraph",
        text: "Nadia arrived from Damascus in 2019 with a handwritten notebook and no intention of cooking professionally. The muhammara was for her neighbours. The neighbours told other people. Six years later she takes orders four days a week and closes on Fridays because Friday is for her own family.",
      },
      {
        type: "paragraph",
        text: "What she will not do is scale. We asked. The answer involved a fairly detailed explanation of why walnuts have to be ground the same morning, and it was convincing.",
      },
      { type: "heading", text: "Shirin, and the unglamorous genius of tiffin" },
      {
        type: "paragraph",
        text: "Shirin cooks lunch. Not brunch, not a concept — lunch, for people at desks, delivered by one o'clock. Rice, one protein, two vegetables, dal. The same shape every day, the contents rotating weekly, ordered the night before so nothing is cooked that will not be eaten.",
      },
      {
        type: "list",
        items: [
          "Around 90 tiffins a day, five days a week.",
          "Orders close at 9pm the night before, without exception.",
          "Almost no food waste, because the quantity is known before the cooking starts.",
          "A repeat-order rate that embarrasses most restaurants on the platform.",
        ],
      },
      {
        type: "paragraph",
        text: "It is the least photogenic operation we visited and comfortably the best-run. There is a lesson in that, and it is not about photography.",
      },
    ],
    ...base,
  },
  {
    id: "post_track-order",
    slug: "how-live-tracking-works",
    title: "How live order tracking actually works",
    excerpt:
      "The little map that tells you your food is two minutes away — here's the thinking behind that dot.",
    cover: img("photo-1526367790999-0150786686a2"),
    category: "Product",
    ...AUTHORS.team,
    readMinutes: 4,
    publishedAt: "2026-06-24T09:00:00.000Z",
    tags: ["Product", "Delivery", "Engineering"],
    body: [
      {
        type: "paragraph",
        text: "Order tracking looks like a map problem. It is mostly a trust problem. The dot's job is not to be precise — it is to answer, honestly, the only question you are asking: should I be standing up yet?",
      },
      { type: "heading", text: "Three estimates, not one" },
      {
        type: "paragraph",
        text: "Every ETA is really three: how long the kitchen needs, how long until a rider is holding the bag, and how long the ride takes. They fail differently. Kitchens run late in predictable bursts; rides run late because of weather and one specific left turn.",
      },
      {
        type: "list",
          items: [
          "Kitchen time comes from that vendor's own recent history, not a platform average.",
          "Assignment time depends on how many riders are free nearby right now.",
          "Ride time is distance adjusted for the hour and the weather.",
        ],
      },
      { type: "heading", text: "Why we show stages instead of a number" },
      {
        type: "paragraph",
        text: "A single countdown is a promise you will break. A stage timeline — accepted, preparing, picked up, on the way — is information you can act on. When the kitchen is slow you can see that it is the kitchen, which is oddly reassuring, because it means nobody lost your order.",
      },
      {
        type: "quote",
        text: "People forgive a late delivery. They do not forgive not knowing.",
      },
      { type: "heading", text: "The honest part" },
      {
        type: "paragraph",
        text: "When an estimate slips by more than fifteen minutes we tell you, rather than quietly moving the number and hoping. If the delay is large and ours, the compensation is applied without you having to ask for it. That is the whole feature, really. The map is just the part you can see.",
      },
    ],
    ...base,
  },
  {
    id: "post_commission",
    slug: "what-commission-pays-for",
    title: "What restaurant commission actually pays for",
    excerpt:
      "Delivery platforms take a cut. Here is a line-by-line account of where ours goes — and what we do not charge for.",
    cover: img("photo-1552566626-52f8b828add9"),
    category: "Business",
    ...AUTHORS.rina,
    readMinutes: 7,
    publishedAt: "2026-06-12T09:00:00.000Z",
    tags: ["Vendors", "Pricing", "Business"],
    body: [
      {
        type: "paragraph",
        text: "Commission is the most resented number in this industry, largely because it is usually unexplained. A restaurant sees a percentage disappear and is told it covers \"the platform\". That is not an answer, so here is a real one.",
      },
      { type: "heading", text: "Where the money goes" },
      {
        type: "list",
        items: [
          "Payment processing — a fixed cost we pass through at cost, not marked up.",
          "The rider, when you use our fleet. This is the largest single component by a wide margin.",
          "Support, for both you and your customer, including refunds we absorb ourselves.",
          "The product: storefront, menu tools, POS, dashboards, and keeping them running at 8pm on a Friday.",
          "Fraud and chargeback losses, which you would otherwise carry alone.",
        ],
      },
      { type: "heading", text: "What lowers it" },
      {
        type: "paragraph",
        text: "Delivering with your own drivers removes the biggest line item, so the rate drops accordingly. Pickup-only orders are cheaper again. Neither choice affects how visible you are in search, which is the part vendors most expect to be punished for.",
      },
      {
        type: "quote",
        text: "The test of a marketplace is whether the vendor who says no to a discount campaign still gets found.",
      },
      { type: "heading", text: "What we do not charge for" },
      {
        type: "paragraph",
        text: "No joining fee. No monthly software fee on the standard plan. No charge to be listed, no paid placement in search results, and no fee for the POS. If a promotion is our idea, we fund our share of it and say so in writing.",
      },
      {
        type: "paragraph",
        text: "None of this makes commission painless. It does make it arguable, which is the point — you cannot negotiate with a number nobody will break down.",
      },
    ],
    ...base,
  },
  {
    id: "post_packaging",
    slug: "packaging-that-survives-the-trip",
    title: "Packaging that survives the trip",
    excerpt:
      "Why your fries arrive soft and your ramen arrives fine — and what the kitchens getting it right do differently.",
    cover: img("photo-1512058564366-18510be2db19"),
    category: "Guides",
    ...AUTHORS.kitchen,
    readMinutes: 5,
    publishedAt: "2026-06-02T09:00:00.000Z",
    tags: ["Vendors", "Delivery", "Guides"],
    body: [
      {
        type: "paragraph",
        text: "Food does not get worse in transit because of time. It gets worse because of steam. Every complaint about soggy delivery is, underneath, a complaint about a lid that trapped water vapour against something that was supposed to be crisp.",
      },
      { type: "heading", text: "The rule that fixes most of it" },
      {
        type: "paragraph",
        text: "Separate anything wet from anything crisp, and vent anything hot. That is most of the craft. The kitchens on this platform with the best delivery ratings are almost never the ones with the fanciest boxes — they are the ones that packed the sauce apart.",
      },
      {
        type: "list",
        items: [
          "Broth in its own sealed container, noodles dry, toppings in a third pot.",
          "Fries in a vented paper bag, never under a sealed plastic lid.",
          "Salad dressing on the side, always, even when the customer did not ask.",
          "Anything battered gets a paper layer between food and lid to absorb steam.",
          "Cold drinks nowhere near hot food in the same bag.",
        ],
      },
      {
        type: "quote",
        text: "We stopped selling one dish entirely because we could not make it arrive right. Ratings went up.",
        cite: "A cloud kitchen owner who asked not to be named",
      },
      { type: "heading", text: "Knowing what not to sell" },
      {
        type: "paragraph",
        text: "The bravest packaging decision is removing a dish from the delivery menu. A soufflé does not travel. Neither does anything that depends on being served within a minute. Sell it in the dining room, keep it off the app, and protect the rating you have.",
      },
    ],
    ...base,
  },
  {
    id: "post_riders",
    slug: "a-shift-with-a-rider",
    title: "A shift with a rider",
    excerpt:
      "Six hours, twenty-two deliveries and one thunderstorm. What the job is actually like from the saddle.",
    cover: img("photo-1595079676339-1534801ad6cf"),
    category: "Community",
    ...AUTHORS.omar,
    readMinutes: 9,
    publishedAt: "2026-05-20T09:00:00.000Z",
    tags: ["Riders", "Delivery", "Community"],
    body: [
      {
        type: "paragraph",
        text: "Shakib goes online at four in the afternoon, which is early enough to be quiet and late enough to catch the first office orders. By ten past he has his first job: a coffee and two pastries, eight hundred metres, ninety seconds of actual riding and four minutes of waiting for a lift.",
      },
      { type: "heading", text: "The job is mostly waiting" },
      {
        type: "paragraph",
        text: "This is the thing nobody tells you. Riding is maybe half the shift. The rest is lifts, lobbies, security desks, kitchens running eight minutes behind, and the particular purgatory of an apartment block where the buzzer does not work.",
      },
      {
        type: "quote",
        text: "The bike part is easy. It is the last fifty metres that decides whether the order was worth taking.",
        cite: "Shakib, four years riding",
      },
      { type: "heading", text: "What good batching feels like" },
      {
        type: "paragraph",
        text: "Two orders from neighbouring kitchens going to the same street is a gift. Two orders in opposite directions dressed up as a batch is the thing riders quit over. We watched twenty-two deliveries and three batches, all three of them genuinely on the same route, which is the bar we hold ourselves to and do not always clear.",
      },
      { type: "heading", text: "Then it rained" },
      {
        type: "paragraph",
        text: "At 7:40 the sky opened. Demand roughly doubled, the number of riders online fell, and every ETA on the platform stretched. Shakib kept going because the busy-period bonus makes an hour in the rain worth roughly two dry ones, and because he had a jacket that worked.",
      },
      {
        type: "list",
        items: [
          "22 deliveries across six hours.",
          "About 41 kilometres, mostly in second gear.",
          "Three batched pairs, none of them a detour.",
          "One tip that was larger than the delivery fee.",
          "Zero contact with anyone at FoodOra, which he counted as a good sign.",
        ],
      },
      {
        type: "paragraph",
        text: "He logged off at ten. When we asked what would most improve the job, he did not say money. He said working buzzers, and then he said money.",
      },
    ],
    ...base,
  },
  {
    id: "post_currency",
    slug: "building-for-twenty-two-currencies",
    title: "Building for twenty-two currencies",
    excerpt:
      "Multi-currency looks like a formatting problem for about a week. Then you meet tax, rounding and the Bengali numeral system.",
    cover: img("photo-1526304640581-d334cdbbf45e"),
    category: "Product",
    ...AUTHORS.team,
    readMinutes: 6,
    publishedAt: "2026-05-08T09:00:00.000Z",
    tags: ["Product", "Engineering", "Global"],
    body: [
      {
        type: "paragraph",
        text: "The first version of our currency support was a formatter. You picked a currency, we multiplied by a rate and printed a symbol. It survived contact with reality for about a week.",
      },
      { type: "heading", text: "Rounding is a pricing decision" },
      {
        type: "paragraph",
        text: "A dish priced at 720 in one currency converts to something ugly in another. Round it up and you have quietly raised the vendor's price; round it down and you have cut their margin. We let vendors price per currency where they care, and round to a sensible unit where they do not — but the decision is theirs, not a side effect of our arithmetic.",
      },
      { type: "heading", text: "Tax belongs to the vendor's country, not the customer's" },
      {
        type: "paragraph",
        text: "This is the one that catches everyone. The rate that applies is the one where the food is sold, and inclusive-versus-exclusive display varies by country. Getting this wrong does not just look sloppy, it produces invoices a business cannot legally file.",
      },
      {
        type: "list",
        items: [
          "Per-country tax rate, and whether it is included in the displayed price.",
          "Per-currency decimal places — not every currency has two.",
          "Numeral systems: Bengali digits are not a font choice, they are the locale.",
          "Right-to-left layouts, where the currency symbol changes side.",
        ],
      },
      {
        type: "quote",
        text: "If your prices need a code change to work in a new country, you do not support that country yet.",
      },
      { type: "heading", text: "Where it landed" },
      {
        type: "paragraph",
        text: "Every amount in the system is stored as an integer in the vendor's currency, with the region config deciding the rest. Adding a country is a configuration change now, not a release. That is the whole goal: the product is global, and none of the code has an opinion about where you are.",
      },
    ],
    ...base,
  },
  {
    id: "post_lunch",
    slug: "the-office-lunch-problem",
    title: "The office lunch problem",
    excerpt:
      "Nine people, one order, forty minutes and someone who forgot they were vegetarian. How group ordering should work.",
    cover: img("photo-1517248135467-4c7edcad34c4"),
    category: "Guides",
    ...AUTHORS.rina,
    readMinutes: 5,
    publishedAt: "2026-04-22T09:00:00.000Z",
    tags: ["Guides", "Group ordering", "Corporate"],
    body: [
      {
        type: "paragraph",
        text: "Office lunch fails in the same way every time. One person becomes the coordinator, collects requests in three different chat threads, pays for everything, and then spends two days chasing eight colleagues for small amounts of money.",
      },
      { type: "heading", text: "The coordinator is the bug" },
      {
        type: "paragraph",
        text: "Every good solution removes that role. A shared basket everyone adds to, a deadline, a split that happens automatically, and a single delivery. Nobody should be owed money at the end of lunch.",
      },
      {
        type: "list",
        items: [
          "Set a per-person cap so the total stays predictable.",
          "Order from one kitchen — nine dishes from one place beat three from three.",
          "Set the cut-off fifteen minutes before you think you need it.",
          "Order the vegetarian option for one more person than asked for it. Someone always forgets.",
        ],
      },
      {
        type: "quote",
        text: "A tiffin plan removed our lunch decision entirely. Nobody has argued about food since.",
        cite: "An office manager who now looks visibly relaxed",
      },
      { type: "heading", text: "Or stop deciding altogether" },
      {
        type: "paragraph",
        text: "The teams that solved this properly stopped ordering ad hoc and moved to a standing weekly plan from a home kitchen. Same arrival time daily, rotating menu, one invoice at the end of the month. It is less fun to talk about and much better to live with.",
      },
    ],
    ...base,
  },
  {
    id: "post_verification",
    slug: "how-we-verify-a-home-kitchen",
    title: "How we verify a home kitchen",
    excerpt:
      "Six hundred kitchens, every one visited in person. What we look for, and what gets an application declined.",
    cover: img("photo-1556909212-d5b604d0c90d"),
    category: "Trust & safety",
    ...AUTHORS.leila,
    readMinutes: 6,
    publishedAt: "2026-04-05T09:00:00.000Z",
    tags: ["Home chefs", "Trust", "Safety"],
    body: [
      {
        type: "paragraph",
        text: "Letting strangers sell food from their own kitchens is either the best thing about this platform or a scandal waiting to happen, depending entirely on how seriously the verification is taken. So: in person, every kitchen, before a single order.",
      },
      { type: "heading", text: "What the visit covers" },
      {
        type: "list",
        items: [
          "Identity and address, matched to documents rather than a form.",
          "The kitchen itself: refrigeration temperature, storage separation, water source, ventilation.",
          "Whether raw and cooked food can be kept genuinely apart in the space available.",
          "Handwashing that is convenient enough to actually happen mid-service.",
          "A conversation about capacity — a kitchen honest about cooking for thirty is safer than one claiming three hundred.",
        ],
      },
      { type: "heading", text: "What gets declined" },
      {
        type: "paragraph",
        text: "A fridge that cannot hold temperature, no way to separate raw meat from prepared food, or a plan that depends on cooking far more than the space allows. Almost every rejection is fixable, and most applicants come back within a month having fixed it.",
      },
      {
        type: "quote",
        text: "The inspector spent longer looking at my fridge than at my food. At the time it was annoying. It was also correct.",
        cite: "A home chef, now in her third year",
      },
      { type: "heading", text: "And afterwards" },
      {
        type: "paragraph",
        text: "Verification is not a certificate you frame. Kitchens are re-checked annually, immediately after any food-safety complaint, and whenever a chef moves. Complaints get a human within the hour, and a listing comes down first and gets discussed second.",
      },
    ],
    ...base,
  },
];

export const postBySlug = new Map(posts.map((p) => [p.slug, p]));

/** Distinct categories with post counts, for the blog index filter. */
export const postCategories = Array.from(
  posts.reduce((acc, post) => {
    acc.set(post.category, (acc.get(post.category) ?? 0) + 1);
    return acc;
  }, new Map<string, number>()),
  ([name, count]) => ({ name, count }),
);
