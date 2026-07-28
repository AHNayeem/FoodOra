# FoodOra — Foundation

Global Food Ecosystem Platform. **Prototype-first, frontend-only** — mock data,
no backend (see the spec: `# FOOD ECOSYSTEM PLATFORM (Global SaaS).md`).

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16.2 (App Router, Turbopack) |
| UI | React 19.2, TypeScript 5 |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) |
| Animation | Framer Motion 12 |
| i18n | next-intl 4 (cookie-based locale, no URL segment) |
| State | Zustand 5 (cart/UI — added per phase) |
| Forms | React Hook Form 7 + Zod 4 |
| Charts | Recharts 3 |
| Toasts | Sonner |
| Icons | lucide-react |
| Pkg manager | bun |

Run: `bun run dev` → http://localhost:3005

## Architecture

```
app/
  layout.tsx            root shell: fonts, i18n provider, <html dir>, theme, toaster
  (marketing)/          public site (route group) — header + footer chrome
    layout.tsx
    page.tsx            Phase C1 landing (hero, categories, trending, cuisines)
  (dashboard)/          vendor dashboard (route group) — own sidebar + topbar shell
    dashboard/          overview, orders, menu (Phase C10)
  icon.svg  manifest.ts  robots.ts  sitemap.ts  not-found.tsx

config/
  regions.ts            multi-currency / multi-country / tax config (data, not hardcoded)
  i18n/                 locales, request config, setLocale server action

lib/
  theme.ts              design tokens (TS mirror of globals.css @theme)
  utils.ts  format.ts   cn(), slugify(); region-aware price/number/eta formatters
  mock/                 seed data — the ONLY place demo data lives

services/                async data seam — components call THESE, never lib/mock directly
  http.ts               mockDelay(), paginate(), Result envelope
  catalog.ts            getVendors/getTrending/getCuisines/... (backend-ready signatures)
  content.ts            getTestimonials/getBlogPosts (landing social-proof + blog)
  vendor.ts             vendor dashboard reads — stats/charts/best-sellers/orders (Phase C10)

types/                   domain models (BaseEntity w/ soft-delete + audit fields)
components/
  ui/                   primitives: button, badge, rating, toaster, theme-toggle, locale-switcher
  layout/               site-header, site-footer
  cards/                vendor-card
  sections/             hero, category-rail, section-heading, how-it-works,
                        testimonials, app-download (+ store-badges), blog-teaser
  dashboard/            vendor dashboard: shell, stat-card, revenue/peak charts,
                        best-sellers, orders-board, menu-manager (Phase C10)
constants/               site config, navigation model
messages/                en / bn / ar translation catalogs
```

### Key design decisions

- **Swap-ready data layer.** UI is written against `async` functions in
  `services/*` that today wrap `lib/mock`. Replacing the mock with a real
  GraphQL/REST backend touches only `services/*` — no component changes.
- **Mock = real schema.** Every entity extends `BaseEntity` (id, timestamps,
  `deletedAt`) and cross-references others by stable id, so the seed maps 1:1
  onto the eventual Prisma models.
- **CSS-first tokens.** Colors/radius/shadow/motion live as `@theme` custom
  properties in `app/globals.css`, mirrored in `lib/theme.ts` for JS use.
  Dark mode re-points semantic tokens under `.dark` — no per-component `dark:`.
- **Global i18n + RTL.** Locale is a cookie; `<html dir>` flips to `rtl` for
  Arabic. All UI strings go through next-intl (`en`, `bn`, `ar` seeded).
- **Region-aware money.** No component hardcodes a currency symbol;
  `formatPrice(amount, currency)` uses `config/regions.ts`.

## Phase tracker

Phases follow the spec (A–E). Current status:

- [x] **Foundation** — scaffold, design system, i18n, mock seam, running landing shell
- [x] **C1** Landing Website — hero + category rail, three-step *How it works*,
      trending grid, cuisine explorer, customer *testimonials* rail, *get the
      app* CTA (pure-CSS phone mockup, store badges toast "coming soon"), and a
      *from the blog* teaser row. New sections in `components/sections/`; content
      served through `services/content.ts` over `lib/mock/testimonials.ts` +
      `posts.ts` (new `Testimonial` / `BlogPost` types)
- [x] **C2** Authentication UI (mock) — `(auth)` split-screen group: `/login` (password + OTP tabs, social, demo-account fill), `/register` (role picker, RHF+Zod, terms), `/forgot-password` (simulated). Simulated `services/auth.ts`, persisted Zustand session (`stores/auth.ts`), header account menu + sign-out. Reusable `ui/input`, `ui/field`, `auth/otp-input`, `auth/social-buttons`
- [x] **C3** Customer App (`/account/*`) — private, client-auth-gated section
      (`AccountShell`) with a sidebar: **profile** (edit name/phone/avatar +
      locale/currency prefs → simulated `services/account.updateProfile`,
      committed to the session store via `auth.updateUser`), **order history**
      (reads the persisted orders store, splits active/past using the C9
      time-derived status, links into the `/orders/[id]` tracker + receipt),
      **address book** (persisted `stores/addresses.ts`, seeded once from the
      mock — add/edit/delete/set-default; checkout now reads the same store so
      edits carry over), and **wallet** (persisted `stores/wallet.ts` seeded
      from `services/wallet.ts` + `lib/mock/wallet.ts`; balance + ledger +
      simulated top-up). New `Wallet` types; `account` i18n namespace expanded
      (en/bn/ar)
- [x] **C4** Restaurant Directory (`/restaurants`) — URL-driven filters (type/sort/open/search), results grid, empty state, loading skeleton
- [x] **C5** Restaurant Details (`/restaurants/[slug]`) — cover hero, stats, sectioned menu + section nav, info/hours sidebar; `generateStaticParams` + `generateMetadata`, 404 on miss
- [x] **C6** Food data — `menus.ts` (menu sections) + `foods.ts` (~40 items) seeded and surfaced on the detail menu; `FoodItemCard` with popular/spicy/price/compare. Cart action stubbed (toast) pending C7
- [x] **C7** Cart — persisted Zustand store (`stores/cart.ts`, single-vendor rule + conflict prompt), pure math in `lib/cart.ts`, slide-over `CartDrawer` (qty steppers, free-delivery progress, min-order gate, checkout hand-off), `ItemCustomizer` for option groups, header `CartButton` count badge, reusable `ui/modal` + `QuantityStepper`. "Add" button now writes to the store
- [x] **C8** Checkout (`/checkout`) — fulfillment toggle (delivery/pickup), saved-address book + new-address form, contact details (prefilled from session), ASAP/scheduled time slots, simulated payment (cash/card/wallet), order notes, rider tip + promo code, live tax/total math (`lib/checkout.ts`). Simulated `services/orders.ts` `placeOrder` → persisted `stores/orders.ts`; confirmation at `/checkout/success?order=…` (receipt + ETA, reads the orders store). Seeded `lib/mock/addresses.ts`
- [x] **C9** Order Tracking (`/orders/[id]`) — simulated live tracker. Status is
      *derived from elapsed time* between `placedAt` and `estimatedDeliveryAt`
      (`lib/tracking.ts`, pure): stage timeline (placed→…→delivered / →ready for
      pickup), ETA countdown, "Live" badge, stylised route map with an advancing
      courier marker, assigned courier card (call/message stubs), and customer
      cancellation while the kitchen hasn't started (`cancelOrder` service +
      `updateStatus` store, `cancelled` persists). Ticks every 10s. Seeded
      `lib/mock/couriers.ts`
- [x] **C10** Restaurant Dashboard (`/dashboard`) — own `(dashboard)` route group
      with its own sidebar + topbar shell, client-gated to management roles
      (`DashboardShell` resolves the "my restaurant" vendor once). **Overview**:
      KPI cards (revenue/orders/AOV/rating with day-over-day deltas + live
      pending count), a 7-day revenue area chart + peak-hours bar chart
      (Recharts), best sellers and a recent-orders list. **Orders**: workflow
      board (New/Preparing/Ready/Completed/Cancelled tabs) with accept →
      prepare → ready → hand-off advance actions + reject, all simulated.
      **Menu**: live menu by section with 86 / restore availability toggles.
      The order history + analytics are synthesised per-vendor and anchored to
      `now` (`lib/mock/vendor-orders.ts` factory → `lib/analytics.ts` pure
      aggregates → `services/vendor.ts`); a persisted `stores/merchant.ts` holds
      the storefront online switch + item availability overrides. New
      `dashboard` i18n namespace (en/bn/ar); `Vendor.ownerId` links Bella Napoli
      to the `usr_owner` demo account
- [x] **C11** POS Lite (`/dashboard/pos`) — in-store cashier terminal in the
      vendor dashboard. Tap-to-add product grid (search + category rail) beside
      a live ticket: order type (dine-in/takeaway/delivery), dine-in table
      picker, line steppers, quick % discounts, kitchen note, and a country-tax
      totals breakdown. **Hold / recall** parks tickets in a persisted register;
      **charge** takes cash (quick-tender presets + live change), card or wallet
      — all simulated — producing a persisted `PosSale` + printable receipt.
      Pure math in `lib/pos.ts` (`computePosTotals`, `changeDue`,
      `cashTenderPresets`); simulated `services/pos.ts`
      (`getPosCatalog`/`getPosTables`/`completeSale`); persisted
      `stores/pos.ts` (sales + held tickets). New `types/pos.ts` +
      `types/table.ts`; seeded `lib/mock/tables.ts` (dine-in floor plans, also
      groundwork for C16). New `pos` i18n namespace (en/bn/ar, full Arabic
      plurals); dashboard sidebar gains a POS link
- [ ] **C12–C16** QR menu, home-chef marketplace, cafe directory,
      subscription meals, table booking
- [x] **C17** Catering (`/catering`) — event-catering vertical. **Directory**
      (`/catering`, URL-driven event-type / sort / search filters, hero, caterer
      grid, *how catering works*), **caterer detail** (`/catering/[slug]`, hero
      with capacity/from-price/lead-time stats, gallery, per-guest packages,
      add-ons, highlights; `generateStaticParams` + `generateMetadata` + 404),
      **quote builder** (`/catering/[slug]/quote`) combining custom quotation +
      package builder + calendar booking on one page with a live estimate
      sidebar, and a **confirmation/status** page (`/catering/quotes/[id]`,
      reads the persisted quotes store). Pure estimate math in `lib/catering.ts`
      (`estimateQuote` — per-guest subtotal + add-ons + service fee + country
      tax); simulated `services/catering.ts` (`getCateringServices`/…/
      `requestQuote`) over `lib/mock/catering.ts` (6 caterers, ~16 packages, 7
      add-ons); persisted `stores/catering.ts` (skipHydration like orders). New
      `catering` types + i18n namespace (en/bn/ar, full Arabic plurals)
- [ ] **C18–C33** rider app, wallet UI, offers, coupons, reviews, AI assistant,
      notifications, CMS, analytics, settings, a11y/perf review
- [ ] **D / E** Backend architecture & implementation (after prototype is complete)

### Known stubs (expected at this stage)

`/restaurants`, `/restaurants/[slug]`, `/login`, `/register` and
`/forgot-password` are live. Remaining nav links (`/cafes`, `/offers`,
`/search`, …), the landing blog links (`/blog`, `/blog/[slug]` — CMS is a later
phase) and the remaining account-menu targets (`/account/favorites`,
`/account/settings`, `/terms`, `/privacy`) still resolve to the
404 page until their phases are built. The vendor dashboard (`/dashboard`,
`/dashboard/orders`, `/dashboard/menu`) is live behind the sign-in + management-role
gate (sign in as `owner@foodora.dev` / `demo1234`). The customer app (`/account`,
`/account/orders`, `/account/addresses`, `/account/wallet`) is live behind the
sign-in gate. Auth is fully simulated (no backend/JWT): any seeded account signs in
with password `demo1234`, OTP accepts `123456`, social buttons resolve to the
demo customer. The cart is live (add from any menu, single-vendor) and checkout is live
(`/checkout` → place order → `/checkout/success`). Placed orders persist in the
orders store; the confirmation screen's "Track your order" button opens
`/orders/[id]`, the live tracker (C9) — it resolves orders placed on *this*
device (the persisted store) and shows a not-found state for unknown ids.
Review entities are deferred to their phases; the *types* exist so services are
ready.
