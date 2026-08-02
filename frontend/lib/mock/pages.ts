import type {
  FaqGroup,
  HowStep,
  JobOpening,
  LegalDoc,
  StatItem,
  SupportChannel,
  TimelineEntry,
  ValueProp,
} from "@/frontend/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * Content for the marketing and legal pages (spec: CMS — About, Terms, Privacy,
 * FAQs, Landing Pages).
 *
 * Following the same convention as `posts.ts` and `testimonials.ts`: the
 * human-authored *content* lives on the entity as data (this is what the CMS
 * will own), while the surrounding UI chrome — headings, labels, buttons — goes
 * through next-intl. No page component holds prose of its own.
 */

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

export const aboutMission =
  "FoodOra exists to make good food easy to find and fair to sell. We build the software so a wood-fired pizzeria, a home cook with three regulars and a delivery-only noodle bar can all reach the people who want what they make — without handing over a third of the bill to do it.";

export const aboutStory: string[] = [
  "We started in 2021 with one restaurant, a shared spreadsheet and a phone that would not stop ringing. The owner did not need a bigger menu or a louder sign; she needed the orders to arrive in one place, priced correctly, in the right order.",
  "That is still the whole idea. Everything we have built since — the storefronts, the POS, the rider network, the catering quotes, the analytics — grew out of a real kitchen asking for one specific thing to stop being hard.",
  "Today FoodOra runs in fourteen countries, in twenty-two currencies, in whichever language the customer opens the app in. The product is global; the food never is. Every city on the platform looks like the city, not like us.",
];

export const aboutValues: ValueProp[] = [
  {
    icon: "Store",
    title: "The kitchen comes first",
    description:
      "Vendors are not inventory. Commission is published, payouts land weekly, and no restaurant is ever ranked down for refusing a discount campaign.",
  },
  {
    icon: "HandCoins",
    title: "Honest pricing",
    description:
      "The price you see is the price you pay. No dynamic surcharge that appears at checkout, no fee invented to pad a total.",
  },
  {
    icon: "ShieldCheck",
    title: "Safety we can prove",
    description:
      "Every home kitchen is verified in person. Every rider is insured on shift. Every food-safety complaint gets a human within the hour.",
  },
  {
    icon: "Leaf",
    title: "Less waste, quietly",
    description:
      "Default no-cutlery, surplus meals at a discount near closing, and route batching that cuts kilometres rather than corners.",
  },
];

export const aboutStats: StatItem[] = [
  { value: "14", label: "countries" },
  { value: "18,600+", label: "kitchens and cafes" },
  { value: "4.2M", label: "orders a month" },
  { value: "22", label: "currencies supported" },
];

export const aboutTimeline: TimelineEntry[] = [
  {
    year: "2021",
    title: "One restaurant, one spreadsheet",
    description:
      "FoodOra launches as an order inbox for a single pizzeria in Dhaka. Forty orders in the first week.",
  },
  {
    year: "2022",
    title: "Storefronts and delivery",
    description:
      "Vendors get their own pages and menus; the first hundred riders join. Cafes and cloud kitchens follow.",
  },
  {
    year: "2023",
    title: "Home chefs",
    description:
      "In-person kitchen verification opens the platform to home cooks — the fastest-growing category to this day.",
  },
  {
    year: "2024",
    title: "POS and catering",
    description:
      "POS Lite puts the counter and the app on one order book. Event catering quotes go live.",
  },
  {
    year: "2025",
    title: "Global by default",
    description:
      "Multi-currency, multi-language and per-country tax rules ship together. Fourteen countries by year end.",
  },
  {
    year: "2026",
    title: "One ecosystem",
    description:
      "Subscriptions, table booking and QR menus join the same platform, so a vendor runs everything from one dashboard.",
  },
];

// ---------------------------------------------------------------------------
// Help centre
// ---------------------------------------------------------------------------

export const helpChannels: SupportChannel[] = [
  {
    icon: "Headphones",
    title: "Chat with support",
    description:
      "The fastest route for anything about a live order — a missing item, a late rider, a wrong address.",
    actionLabel: "Open a chat",
    href: "/account/orders",
    availability: "24/7",
  },
  {
    icon: "CreditCard",
    title: "Billing and refunds",
    description:
      "Charges you do not recognise, refunds that have not landed, or a receipt you need for expenses.",
    actionLabel: "Email billing",
    href: "mailto:billing@foodora.example.com",
    availability: "Replies within 4 hours",
  },
  {
    icon: "Store",
    title: "Vendor support",
    description:
      "For restaurants, cafes, home chefs and cloud kitchens: menus, payouts, POS and dashboard questions.",
    actionLabel: "Vendor help desk",
    href: "/partner",
    availability: "Mon–Sat, 8am–10pm",
  },
  {
    icon: "Bike",
    title: "Rider support",
    description:
      "On-shift issues, earnings queries, equipment and insurance — with a priority line while you are riding.",
    actionLabel: "Rider help",
    href: "/rider",
    availability: "24/7 while on shift",
  },
];

export const helpFaqs: FaqGroup[] = [
  {
    id: "orders",
    title: "Orders and delivery",
    icon: "Bike",
    items: [
      {
        question: "How do I track my order?",
        answer:
          "Open the order from your account and you will see the live tracker: the stage the kitchen is at, the assigned rider, and a countdown to your door. It updates on its own — no need to refresh.",
      },
      {
        question: "Can I change my order after placing it?",
        answer:
          "You can cancel free of charge until the kitchen starts preparing it, which is usually a two- to three-minute window. After that, message support and we will do what we can, but the kitchen may already have cooked it.",
      },
      {
        question: "Something was missing or wrong. What now?",
        answer:
          "Report it from the order page within 48 hours. Missing items are refunded to your original payment method or your wallet, whichever you choose. You will not need to send a photo for a single missing item.",
      },
      {
        question: "Why is delivery taking longer than the estimate?",
        answer:
          "Estimates account for the kitchen's current queue and traffic, but weather and large orders can push past them. If the ETA slips by more than 15 minutes you will get a notification, and long delays are compensated automatically.",
      },
      {
        question: "Can I order for later?",
        answer:
          "Yes. Choose a scheduled slot at checkout, up to seven days ahead. The kitchen is told when to start cooking, not when you ordered, so scheduled food arrives as fresh as ASAP food.",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments and refunds",
    icon: "CreditCard",
    items: [
      {
        question: "Which payment methods can I use?",
        answer:
          "Cards, mobile wallets, your FoodOra wallet balance and cash on delivery where the vendor supports it. The methods available to you depend on your country and are shown at checkout.",
      },
      {
        question: "When do refunds arrive?",
        answer:
          "Wallet refunds are instant. Card refunds are issued the same day and typically appear in three to five working days, depending on your bank — we cannot speed that part up.",
      },
      {
        question: "What is the FoodOra wallet for?",
        answer:
          "It holds refunds, cashback and top-ups, and it is the fastest way to pay. Balance never expires and you can withdraw a top-up you have not spent.",
      },
      {
        question: "Do you add fees at checkout?",
        answer:
          "You will see the item total, the delivery fee, any applicable tax and your tip — and nothing else. There is no service charge invented at the last step.",
      },
    ],
  },
  {
    id: "account",
    title: "Account and privacy",
    icon: "ShieldCheck",
    items: [
      {
        question: "How do I change my language or currency?",
        answer:
          "Both are in the header, and in your account settings if you want them to stick. Currency changes reprice the whole site immediately; language switches take effect on the next page.",
      },
      {
        question: "Can I delete my account?",
        answer:
          "Yes, from account settings. We delete your profile and addresses immediately and keep only the order and tax records we are legally required to retain, in a form that is no longer linked to your profile.",
      },
      {
        question: "Who can see my address?",
        answer:
          "The rider on your active order, and no one else. Vendors see your name and order, never your street address. Rider access ends when the delivery completes.",
      },
    ],
  },
  {
    id: "vendors",
    title: "For vendors and riders",
    icon: "Store",
    items: [
      {
        question: "How much commission do you charge?",
        answer:
          "It depends on the plan and whether you use our riders or your own — the range is published on the partner page before you sign anything. There is no joining fee and no minimum term.",
      },
      {
        question: "When do vendors get paid?",
        answer:
          "Weekly, every Tuesday, for the week ending the previous Sunday. The dashboard shows the exact figure and its breakdown before the transfer leaves.",
      },
      {
        question: "How do riders get paid?",
        answer:
          "Per delivery plus distance, with the fee shown before you accept. Earnings are visible live in the rider app and paid out weekly, or instantly for a small fee.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Careers
// ---------------------------------------------------------------------------

export const careersIntro =
  "We are about 300 people across fourteen countries, and we hire for judgement over pedigree. Most of the team has worked in a kitchen, on a bike, or behind a counter at some point — it shows in the product.";

export const careersPerks: ValueProp[] = [
  {
    icon: "MapPin",
    title: "Remote-first, genuinely",
    description:
      "Hire anywhere we can legally employ you. Two team weeks a year in person, travel covered.",
  },
  {
    icon: "Wallet",
    title: "Transparent pay bands",
    description:
      "Every role has a published band and a location multiplier. No negotiation lottery.",
  },
  {
    icon: "CalendarClock",
    title: "Time that is actually yours",
    description:
      "Unlimited leave with a 25-day floor we chase you to take, and no meetings before 10am local.",
  },
  {
    icon: "Utensils",
    title: "A food budget",
    description:
      "A monthly allowance on the platform. Spend it on the vendors you are building for.",
  },
];

export const jobOpenings: JobOpening[] = [
  {
    id: "job_senior_frontend",
    slug: "senior-frontend-engineer",
    title: "Senior Frontend Engineer",
    team: "Engineering",
    location: "Dhaka or remote (GMT+2 to GMT+8)",
    employment: "Full-time",
    workplace: "Remote",
    summary:
      "Own the customer ordering experience end to end — search, menu, cart, checkout. You will care about the 3G render as much as the animation curve.",
    ...base,
  },
  {
    id: "job_product_designer",
    slug: "product-designer-vendor",
    title: "Product Designer, Vendor Tools",
    team: "Design",
    location: "Remote (Europe or Asia)",
    employment: "Full-time",
    workplace: "Remote",
    summary:
      "Design for people holding a spatula. The POS and dashboard get used one-handed, in a hurry, on a greasy screen — design accordingly.",
    ...base,
  },
  {
    id: "job_backend_payments",
    slug: "backend-engineer-payments",
    title: "Backend Engineer, Payments",
    team: "Engineering",
    location: "Remote (GMT-1 to GMT+6)",
    employment: "Full-time",
    workplace: "Remote",
    summary:
      "Multi-currency, multi-gateway, per-country tax. You will make money movement boring and auditable across fourteen jurisdictions.",
    ...base,
  },
  {
    id: "job_city_lead",
    slug: "city-lead-chittagong",
    title: "City Lead, Chittagong",
    team: "Operations",
    location: "Chittagong, Bangladesh",
    employment: "Full-time",
    workplace: "On-site",
    summary:
      "Launch and run a city: sign the kitchens worth having, build the rider pool, own the numbers. Heavy on judgement, light on process.",
    ...base,
  },
  {
    id: "job_vendor_success",
    slug: "vendor-success-manager",
    title: "Vendor Success Manager",
    team: "Operations",
    location: "Dhaka, Bangladesh",
    employment: "Full-time",
    workplace: "Hybrid",
    summary:
      "Help restaurants and home chefs actually make money here — menu pricing, photography, promotions, and honest advice when a plan is not working.",
    ...base,
  },
  {
    id: "job_data_analyst",
    slug: "data-analyst-marketplace",
    title: "Data Analyst, Marketplace",
    team: "Data",
    location: "Remote (any timezone)",
    employment: "Full-time",
    workplace: "Remote",
    summary:
      "Answer the questions that decide roadmaps: what makes a vendor stay, what makes a customer come back, where a city is leaking demand.",
    ...base,
  },
  {
    id: "job_support_specialist",
    slug: "support-specialist-night",
    title: "Support Specialist (Nights)",
    team: "Support",
    location: "Dhaka, Bangladesh",
    employment: "Part-time",
    workplace: "Hybrid",
    summary:
      "The late shift, 10pm to 6am. Fewer tickets, harder ones — and the autonomy to fix them without asking permission.",
    ...base,
  },
];

// ---------------------------------------------------------------------------
// Partner with us (vendor acquisition)
// ---------------------------------------------------------------------------

export const partnerIntro =
  "Put your kitchen in front of everyone ordering nearby, keep your own prices, and run the whole thing from one dashboard. Setup takes an afternoon.";

export const partnerStats: StatItem[] = [
  { value: "18,600+", label: "kitchens already on FoodOra" },
  { value: "31%", label: "average order growth in year one" },
  { value: "Weekly", label: "payouts, every Tuesday" },
  { value: "0", label: "joining fee" },
];

export const partnerValues: ValueProp[] = [
  {
    icon: "Store",
    title: "Your storefront, your menu",
    description:
      "Set your own prices, hours and dish availability. 86 an item from the dashboard and it disappears from every channel at once.",
  },
  {
    icon: "Percent",
    title: "Commission you can read",
    description:
      "One published rate per plan. Lower if you deliver with your own drivers. No listing fees, no pay-to-rank.",
  },
  {
    icon: "CreditCard",
    title: "POS included",
    description:
      "POS Lite comes with every plan, so counter sales and app orders land in one order book and one set of numbers.",
  },
  {
    icon: "TrendingUp",
    title: "Numbers that mean something",
    description:
      "Revenue, peak hours, best sellers and repeat-order rate — per branch, updated as orders land.",
  },
  {
    icon: "Bike",
    title: "Riders when you want them",
    description:
      "Use our fleet, your own drivers, or both by time of day. Pickup-only is a perfectly good answer too.",
  },
  {
    icon: "Headphones",
    title: "A human on the phone",
    description:
      "A named contact for your first ninety days, then a vendor line that answers Monday to Saturday, 8am to 10pm.",
  },
];

export const partnerSteps: HowStep[] = [
  {
    icon: "Store",
    title: "Tell us about the kitchen",
    description:
      "Name, address, what you cook and your trade licence. Ten minutes, and you can do it from a phone.",
  },
  {
    icon: "BadgeCheck",
    title: "Get verified",
    description:
      "We check your licence and food-safety paperwork, and visit if you are a home kitchen. Usually two working days.",
  },
  {
    icon: "Utensils",
    title: "Build the menu",
    description:
      "Upload a spreadsheet or photograph your printed menu and we will draft it for you to correct. Photography is free in your first month.",
  },
  {
    icon: "Sparkles",
    title: "Go live",
    description:
      "Flip the storefront online when you are ready. Most kitchens take their first order the same evening.",
  },
];

export const partnerFaqs: FaqGroup[] = [
  {
    id: "partner-basics",
    title: "Getting started",
    icon: "Store",
    items: [
      {
        question: "What does it cost to join?",
        answer:
          "Nothing to join and nothing monthly on the standard plan — you pay commission on orders we bring you. Rates are on the plan comparison and in your contract before you sign.",
      },
      {
        question: "How long does approval take?",
        answer:
          "Two working days for a licensed restaurant or cafe. Home kitchens take a little longer because we visit in person.",
      },
      {
        question: "Do I need my own delivery drivers?",
        answer:
          "No. Use our riders, your own, or a mix — you can switch by day of the week. Pickup-only vendors are welcome.",
      },
      {
        question: "Can I keep my prices the same as in-store?",
        answer:
          "Yes, and most vendors do. You set every price on the platform; we never adjust them and never require a discount to stay visible.",
      },
    ],
  },
  {
    id: "partner-money",
    title: "Payouts and pricing",
    icon: "Wallet",
    items: [
      {
        question: "When am I paid?",
        answer:
          "Every Tuesday for the week that ended on Sunday, straight to your business account. The dashboard shows the breakdown before the transfer goes out.",
      },
      {
        question: "Who pays for a refunded order?",
        answer:
          "Whoever caused it. A kitchen error comes off your settlement; a rider or platform error is on us. You can dispute any deduction in the dashboard and a human reviews it.",
      },
      {
        question: "Is there a minimum contract?",
        answer:
          "No. Leave whenever you like — turn the storefront off and your final settlement pays out on the next cycle.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Ride with us (rider acquisition)
// ---------------------------------------------------------------------------

export const riderIntro =
  "Choose your own hours, see what every delivery pays before you accept it, and get paid weekly — or instantly if you would rather not wait.";

export const riderStats: StatItem[] = [
  { value: "৳240–420", label: "typical earnings per hour" },
  { value: "Weekly", label: "payouts, or instant on demand" },
  { value: "100%", label: "of tips, always yours" },
  { value: "24/7", label: "support while you are on shift" },
];

export const riderValues: ValueProp[] = [
  {
    icon: "CalendarClock",
    title: "Your hours, no shift roster",
    description:
      "Go online when it suits you. No minimum hours, no penalty for a quiet week, no blocks to book in advance.",
  },
  {
    icon: "HandCoins",
    title: "See the fee first",
    description:
      "Distance, pickup and total fee are shown before you accept. Decline as often as you like — it does not affect what you are offered.",
  },
  {
    icon: "ShieldCheck",
    title: "Insured on every shift",
    description:
      "Third-party and personal accident cover included while you are online, at no cost to you.",
  },
  {
    icon: "Wallet",
    title: "Cash out when you want",
    description:
      "Weekly by default, or instantly to your mobile wallet for a small flat fee. Earnings update live as you ride.",
  },
  {
    icon: "MapPin",
    title: "Batched sensibly",
    description:
      "We group orders that are genuinely on the same route — never a second pickup that doubles your trip for the same fee.",
  },
  {
    icon: "Headphones",
    title: "Priority support on the road",
    description:
      "A dedicated line while you are on shift, answered in under two minutes on average.",
  },
];

export const riderSteps: HowStep[] = [
  {
    icon: "Bike",
    title: "Apply online",
    description:
      "Your details, your vehicle and where you want to ride. About five minutes on a phone.",
  },
  {
    icon: "BadgeCheck",
    title: "Send your documents",
    description:
      "National ID, licence and vehicle papers where the law requires them. Checks usually clear in 48 hours.",
  },
  {
    icon: "Sparkles",
    title: "Collect your kit",
    description:
      "A thermal bag and a jacket from your city hub, plus a half-hour walkthrough of the app.",
  },
  {
    icon: "HandCoins",
    title: "Go online and earn",
    description:
      "Open the app, go online, accept your first delivery. Your first payout lands the following Tuesday.",
  },
];

export const riderFaqs: FaqGroup[] = [
  {
    id: "rider-basics",
    title: "Getting started",
    icon: "Bike",
    items: [
      {
        question: "What do I need to sign up?",
        answer:
          "To be of legal working age, hold the right to work in the country, and have a bicycle, scooter or motorcycle with valid papers. Cyclists do not need a licence.",
      },
      {
        question: "Do I need my own bag and jacket?",
        answer:
          "No. Both are issued free at your city hub, and replaced free if they wear out. You keep them if you stop riding.",
      },
      {
        question: "Can I ride part-time?",
        answer:
          "Most riders do. There is no minimum, no roster and no penalty for going offline for a month.",
      },
    ],
  },
  {
    id: "rider-earnings",
    title: "Earnings and support",
    icon: "Wallet",
    items: [
      {
        question: "How is my fee calculated?",
        answer:
          "A base fee per delivery plus distance from pickup to drop-off, with a busy-period bonus when demand is high. The full fee is shown before you accept.",
      },
      {
        question: "Do I keep tips?",
        answer:
          "All of them. Tips are passed through in full and shown separately in your earnings — we never count them toward the delivery fee.",
      },
      {
        question: "What happens if I have an accident?",
        answer:
          "Call the priority line straight away; you are covered by accident insurance while online. We will reassign your order and pay the fee for it regardless.",
      },
      {
        question: "What if a customer is not there?",
        answer:
          "Follow the in-app prompts — call, wait five minutes, then mark it undeliverable. You are paid the full fee, and you never carry the cost of a no-show.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Legal documents
// ---------------------------------------------------------------------------

export const legalDocs: LegalDoc[] = [
  {
    id: "doc_terms",
    slug: "terms",
    title: "Terms of service",
    effectiveFrom: "2026-05-01",
    intro:
      "These terms govern your use of FoodOra — the website, the apps and the services behind them. They explain what you can expect from us and what we need from you. Please read them; by placing an order you agree to them.",
    sections: [
      {
        id: "about-these-terms",
        heading: "1. About these terms",
        paragraphs: [
          "FoodOra operates a marketplace that connects you with restaurants, cafes, cloud kitchens, home chefs and catering companies. We provide the technology, the payment handling and, where you choose it, the delivery. The food itself is prepared and sold by the vendor, not by us.",
          "We may update these terms as the service changes. If a change materially affects your rights we will tell you at least 30 days before it takes effect. Continuing to use FoodOra after that date means you accept the revised terms.",
        ],
      },
      {
        id: "your-account",
        heading: "2. Your account",
        paragraphs: [
          "You need an account to order. You must be old enough to enter a contract where you live, give accurate details, and keep your login credentials to yourself. You are responsible for orders placed from your account.",
          "We may suspend an account we reasonably believe is being used fraudulently, to abuse promotions, or to harass vendors or riders. Where we do, we will tell you why and how to appeal, unless the law prevents us.",
        ],
      },
      {
        id: "orders-and-prices",
        heading: "3. Orders, prices and availability",
        paragraphs: [
          "An order is an offer to buy from the vendor. It is accepted when the vendor confirms it — that is the point a contract is formed, and the point your payment is captured.",
          "Vendors set their own menu prices, minimum order values and delivery fees. The total you see before confirming includes the item prices, the delivery fee, applicable tax and any tip you add. We do not add charges after that screen.",
          "Menus change and kitchens run out. If an item becomes unavailable after you order, the vendor or our support team will offer a substitution or refund that item in full.",
        ],
        bullets: [
          "Prices are shown in your selected currency and converted at the rate displayed at checkout.",
          "Tax is calculated according to the rules of the vendor's country.",
          "Promotional discounts apply only while the promotion is live and within its stated terms.",
        ],
      },
      {
        id: "cancellation",
        heading: "4. Cancellations and refunds",
        paragraphs: [
          "You can cancel free of charge until the vendor begins preparing your order. After preparation starts, a cancellation may be charged in part or in full, because the food has been made.",
          "If an order arrives late, incomplete, or not as described, report it within 48 hours from the order page. Verified issues are refunded to your original payment method or your FoodOra wallet, whichever you choose.",
        ],
      },
      {
        id: "delivery",
        heading: "5. Delivery",
        paragraphs: [
          "Delivery estimates are estimates. They reflect the kitchen's queue and current conditions, and are not guarantees. Where a delay is substantial and our fault, we compensate it.",
          "Someone needs to be able to receive the order at the address you gave. If nobody is available after the rider has called and waited, the order may be treated as delivered and not refunded.",
        ],
      },
      {
        id: "vendors-and-riders",
        heading: "6. Vendors and riders",
        paragraphs: [
          "Vendors are independent businesses responsible for their food, their descriptions, their allergen information and their compliance with local food-safety law. Riders are independent contractors or employees of local delivery partners, depending on the country.",
          "We verify vendor licences and, for home kitchens, inspect in person. That verification does not make us the producer of the food, and it does not transfer the vendor's legal responsibilities to us.",
        ],
      },
      {
        id: "allergens",
        heading: "7. Allergens and dietary information",
        paragraphs: [
          "Dietary tags and allergen notes are supplied by vendors. We surface them as given and check them when a complaint is raised, but we cannot guarantee a kitchen is free of any particular allergen.",
          "If you have a serious allergy, contact the vendor through the order chat before ordering. Do not rely on tags alone.",
        ],
      },
      {
        id: "liability",
        heading: "8. Our liability",
        paragraphs: [
          "We are responsible for losses we cause by failing to use reasonable care, and for anything the law does not permit us to exclude. We are not responsible for a vendor's food quality or for losses that were not reasonably foreseeable.",
          "Nothing in these terms limits your statutory consumer rights in your country of residence.",
        ],
      },
      {
        id: "governing-law",
        heading: "9. Governing law and disputes",
        paragraphs: [
          "These terms are governed by the law of the country in which you placed the order, and you may bring proceedings in your local courts.",
          "Before going to court, please contact support — most disputes are resolved within a few days, and we would rather fix it than argue about it.",
        ],
      },
    ],
    ...base,
  },
  {
    id: "doc_privacy",
    slug: "privacy",
    title: "Privacy policy",
    effectiveFrom: "2026-05-01",
    intro:
      "This policy explains what personal data FoodOra collects, why we need it, who we share it with and what you can do about it. We collect what the service requires and not more.",
    sections: [
      {
        id: "what-we-collect",
        heading: "1. What we collect",
        paragraphs: [
          "Data you give us: your name, email, phone number, delivery addresses, order contents and notes, and payment details (held by our payment processors, never in full on our systems).",
          "Data we generate: order history, ratings you leave, support conversations, wallet transactions, and the device and app diagnostics needed to keep the service working.",
          "Location data: only while you have an active order, and only precisely enough to route a rider to you. We do not track your location in the background.",
        ],
      },
      {
        id: "why-we-use-it",
        heading: "2. Why we use it",
        paragraphs: [
          "To take and deliver your orders, take payment, handle refunds, provide support, prevent fraud, meet tax and food-safety obligations, and improve the product.",
          "For marketing, only with your consent, and you can withdraw it at any time from account settings without affecting anything else.",
        ],
        bullets: [
          "We do not sell personal data.",
          "We do not use your order history to set a different price for you than for anyone else.",
          "We do not share your contact details with vendors beyond the name on the order.",
        ],
      },
      {
        id: "who-sees-it",
        heading: "3. Who we share it with",
        paragraphs: [
          "Vendors receive the order and the first name on it. Riders receive your delivery address and phone number for the duration of the delivery, and lose access when it completes.",
          "Processors acting on our instructions — payment providers, cloud hosting, notification and analytics services — receive only what they need under contract. Authorities receive data only where the law requires it.",
        ],
      },
      {
        id: "how-long",
        heading: "4. How long we keep it",
        paragraphs: [
          "Order and invoice records are kept for as long as tax law requires, typically six to ten years depending on the country. Support conversations are kept for two years.",
          "Everything else is deleted or de-identified within 30 days of you closing your account.",
        ],
      },
      {
        id: "your-rights",
        heading: "5. Your rights",
        paragraphs: [
          "You can access, correct, export or delete your data, object to processing, and withdraw consent. Most of this is self-service in account settings; anything else goes to our privacy team and gets an answer within 30 days.",
          "If you are not satisfied with our answer you can complain to your local data-protection authority. We would appreciate the chance to fix it first.",
        ],
        bullets: [
          "Export: account settings → privacy → download my data.",
          "Deletion: account settings → privacy → delete account.",
          "Anything else: privacy@foodora.example.com.",
        ],
      },
      {
        id: "transfers",
        heading: "6. International transfers",
        paragraphs: [
          "FoodOra operates in fourteen countries, so your data may be processed outside the country you live in. Where it is, we rely on approved transfer mechanisms — adequacy decisions or standard contractual clauses — and apply the same protections either way.",
        ],
      },
      {
        id: "cookies",
        heading: "7. Cookies and similar technologies",
        paragraphs: [
          "We use cookies that are strictly necessary (signing you in, keeping your cart, remembering your language and currency) without asking, because the service does not work without them.",
          "Analytics and marketing cookies are set only if you accept them, and you can change your mind at any time from the cookie settings link in the footer.",
        ],
      },
      {
        id: "children",
        heading: "8. Children",
        paragraphs: [
          "FoodOra is not intended for children. We do not knowingly collect data from anyone below the minimum age in their country, and we delete it if we discover we have.",
        ],
      },
      {
        id: "changes",
        heading: "9. Changes to this policy",
        paragraphs: [
          "We will post any change here and, if it materially affects you, notify you at least 30 days before it takes effect. Previous versions are available on request.",
        ],
      },
    ],
    ...base,
  },
];

export const legalDocBySlug = new Map(legalDocs.map((d) => [d.slug, d]));
export const jobBySlug = new Map(jobOpenings.map((j) => [j.slug, j]));
