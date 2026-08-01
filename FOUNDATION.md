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
    search/             smart search results — every landing funnel lands here
    restaurants|cafes|cloud-kitchens|home-chefs|catering/   vertical directories
    meal-plans/         subscription meal plans + subscribe builder (C15)
    reservations/       table-booking directory + booking confirmation (C16)
    offers/             deals hub (flash / featured / coupons / vendor promos)
    blog/  blog/[slug]/ editorial index + article reader
    about|careers|help|terms|privacy|partner|rider/          CMS-backed pages
    account/            private customer app behind a client auth gate: profile,
                        orders, subscriptions, reservations, favorites, addresses,
                        wallet, coupons, settings
  (dashboard)/          vendor dashboard (route group) — own sidebar + topbar shell
    dashboard/          overview, orders, menu (C10), pos (C11), qr studio (C12),
                        reservations book (C16), coupons (C21)
  (qr)/                 scanned-table surface (route group) — no site chrome at all
    m/[slug]/           QR menu a printed table code resolves to (Phase C12)
  (rider)/              delivery partner app (route group) — phone-shaped frame,
    delivery/           on-shift switch + bottom tabs: today (offers), trip/[id],
                        earnings, wallet, history, profile (Phase C18)
  icon.svg  manifest.ts  robots.ts  sitemap.ts  not-found.tsx

config/
  regions.ts            multi-currency / multi-country / tax config (data, not hardcoded)
  i18n/                 locales, request config, setLocale server action

lib/
  theme.ts              design tokens (TS mirror of globals.css @theme)
  theme-preference.ts   light/dark *preference* contract (storage key + apply/subscribe)
  utils.ts  format.ts   cn(), slugify(); region-aware price/number/eta formatters
  coupons.ts            the coupon rules engine — derived status + one evaluator
                        every coupon surface shares (C21)
  mock/                 seed data — the ONLY place demo data lives

services/                async data seam — components call THESE, never lib/mock directly
  http.ts               mockDelay(), paginate(), Result envelope
  catalog.ts            getVendors/getTrending/getCuisines/... (backend-ready signatures)
  content.ts            getTestimonials/getBlogPosts/getRelatedPosts (social proof + blog)
  search.ts             smart search across vendors + dishes, with facets & sorts
  offers.ts             promotions grouped by placement; owns the clock (C20)
  coupons.ts            the coupon wallet: claim / price against a basket / redeem,
                        plus the merchant's own codes (C21)
  pages.ts              CMS-managed page docs — about/help/careers/legal/pitch
  favorites.ts          re-joins saved ids to vendors/dishes, drops stale ones (C23)
  settings.ts           account settings, password change, closure (C28)
  vendor.ts             vendor dashboard reads — stats/charts/best-sellers/orders (Phase C10)
  pos.ts                counter catalog/tables + simulated completeSale (Phase C11)
  qr.ts                 QR menu config, scanned-table resolution, rounds, service calls (C12)
  subscriptions.ts      meal plans, tiers, weekly menus + subscribe/skip/pause/cancel (C15)
  reservations.ts       bookable venues, availability, book/cancel + the venue's book (C16)
  delivery.ts           rider + zone, trip offers, running a trip, earnings,
                        wallet / cash hand-ins (C18)

types/                   domain models (BaseEntity w/ soft-delete + audit fields)
components/
  ui/                   primitives: button, badge, rating, toaster, theme-toggle, locale-switcher
  layout/               site-header, site-footer
  cards/                vendor-card, food-item-card, food-result-card
  sections/             hero, category-rail, section-heading, how-it-works,
                        testimonials, app-download (+ store-badges), blog-teaser
  search/               search-box (type-ahead), search-filters, search-toolbar
  account/              account-shell + profile/orders/addresses/wallet/favorites
                        views, settings/ (appearance, password, danger zone)
  favorites/            favorite-button (the heart, used on every card)
  directory/            vendor-directory (shared vertical listing), dash-icon
  offers/               offer-card, copy-code, offer-terms, claim-coupon (C21)
  coupons/              coupon-ticket — the one way a coupon is drawn, in the
                        wallet, the checkout picker and the merchant list (C21)
  blog/                 post-card, post-body (structured BlogBlock renderer)
  marketing/            marketing-blocks (hero/stats/values/steps/faq),
                        legal-document, pitch-page (/partner + /rider)
  dashboard/            vendor dashboard: shell, stat-card, revenue/peak charts,
                        best-sellers, orders-board, menu-manager (C10), pos/ (C11),
                        qr/ studio + print sheet (C12),
                        reservations/ book + floor view (C16),
                        coupons/ manager + issue form (C21)
  qr/                   scanned-table guest surface: menu view, item row, welcome,
                        ticket / bill / service sheets, qr-code renderer (C12)
  subscriptions/        meal-plan card/filters/hero, weekly menu, nutrition strip,
                        subscribe builder, account subscription cards (C15)
  reservations/         venue card + directory (live availability), booking form
                        (party/day/time grid), confirmation, account booking
                        cards, vendor-page band (C16)
  rider/                delivery partner app: shell + context, today (offers),
                        offer card, trip view + multi-stop route map + handoff
                        sheet, earnings, wallet, history, profile (C18)
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
- [x] **C12** QR Menu — two surfaces over one seam (`services/qr.ts`). **Guest**
      (`/m/[slug]?t=<table>`, own chrome-free `(qr)` route group, `noindex`):
      a scanned table code opens a welcome sheet (venue greeting, table badge,
      optional guest name), then a one-column mobile menu with sticky search and
      section rail. Guests order in **rounds** — build a round, send it to the
      kitchen, keep ordering — and each sent round's kitchen progress is
      *derived from elapsed time* (C9's pattern, `lib/qr.ts` `roundStatus`), as
      are service-call acknowledgements. A running **bill** sums every sent
      round with the venue's service charge and country tax; payment stays at
      the table (no dine-in rail exists yet, and the screen says so). **Service
      calls** (waiter / water / cutlery / bill) are venue-gated and refuse to
      fire from a table-less venue code. The sitting persists per device in
      `stores/dine-in.ts` — deliberately *not* the delivery cart, and it resets
      when a different table is scanned. **Vendor** (`/dashboard/qr`): a code
      studio that previews, copies, downloads (SVG/PNG) and prints table tents
      as a real A4 sheet in a detached print window, filtered by floor zone,
      plus a read-only summary of what guests can do here. Codes are generated
      in the browser (`qrcode`, loaded on demand) and encode the studio's own
      origin, so they are correct on localhost, a preview deploy and production
      with nothing configured. Seeded `lib/mock/qr-menus.ts` (`QrMenuConfig` per
      sit-down venue — the coffee shop is browse-only, the dessert bar has no
      service charge); tables come from the C11 floor plans. `ItemCustomizer`
      gained an `onAdd` escape hatch so the same sheet serves both carts. New
      `types/qr.ts` + `qr` i18n namespace (en/bn/ar, full Arabic plurals)
- [x] **C13 / C14 (directory layer)** Home Chef Marketplace (`/home-chefs`) and
      Cafe Directory (`/cafes`), plus a Cloud Kitchen Directory
      (`/cloud-kitchens`) — one shared `VendorDirectory` (type pinned by the
      route, `VendorFilters` gains `hideTypeFilter`) with per-vertical hero copy
      and value props. Seed grew from 10 vendors to 23 (5 restaurants, 6 cafes,
      6 cloud kitchens, 6 home chefs), each with menu sections and dishes —
      75 food items total. *Deferred to their own phases:* home-chef weekly-menu
      / subscription scheduling (C15 — now landed), chef income dashboard, table
      booking (C16)
- [x] **C15** Subscription Meals — the recurring vertical (spec: Subscription
      Meal, Healthy Meal Plans, and the home-chef Weekly Menu). **Directory**
      (`/meal-plans`, URL-driven goal / meal-slot / sort / search filters, hero,
      plan grid, *how a meal plan works*), **plan detail**
      (`/meal-plans/[slug]`) with a day-by-day **rotating weekly menu** — every
      dish carries its own macros and each day totals them —
      commitment tiers priced per cycle, a per-day nutrition panel and
      `generateStaticParams` + `generateMetadata` + 404, and a **subscribe
      builder** (`/meal-plans/[slug]/subscribe`, `noindex`) that collects tier,
      which meals, which weekdays, start date, hand-off window, address (reusing
      the C8 address book and `AddressFields`) and kitchen notes against a live
      per-cycle price. **Managing it** lives at `/account/subscriptions`: skip a
      single day, pause until a date, resume, cancel — each mutation validated
      by the seam (a skip past the kitchen's cutoff is refused there, not by a
      disabled button) and committed back to the store.
      The delivery calendar is **never stored**: a subscription keeps only its
      rules (start date, weekdays, skips, pause) and `lib/subscriptions.ts`
      projects them against `now` (C9/C12's pattern), which also makes a pause
      self-expiring — `effectiveStatus` reports active again the day it ends,
      with nothing scheduled to flip a flag. Pure math in `lib/subscriptions.ts`
      (`computeSubscriptionPricing`, `buildSchedule`, `canSkipDelivery`,
      `menuByDay`); simulated `services/subscriptions.ts`; persisted
      `stores/subscriptions.ts`. Seeded `lib/mock/meal-plans.ts` — 6 plans across
      3 kitchens, 16 tiers, 59 menu rows, with each plan's daily macros equal to
      its own menu averaged out; the tiffin service runs Sunday–Thursday (the
      Dhaka work week) and includes delivery. Vendor pages gained a *subscribe to
      this kitchen* band. New `types/subscription.ts` (+ a shared `Weekday` in
      `common.ts`) and `subscriptions` i18n namespace (en/bn/ar, full Arabic
      plurals); header nav and the account menu/sidebar gained the entries
- [x] **C16** Table Booking — the reservations vertical (spec: Table Booking,
      plus the dashboard's Reservation Management / Table Management).
      **Directory** (`/reservations`, URL-driven party / sort / search, venue
      grid, *how booking works*), **booking form**
      (`/restaurants/[slug]/book`, `noindex`, 404 for venues with no floor) —
      party, day and time as one continuous question, since changing the party
      changes the times; taken slots stay visible and struck through so a busy
      evening looks busy — **confirmation/status** (`/reservations/[id]`), and
      **managing it** at `/account/reservations` (upcoming vs past, cancel).
      The venue side is `/dashboard/reservations`: the day's **book** with the
      floor's real actions (confirm / decline / seat / complete / no-show, guarded
      by a transition table) beside a **floor view** of who is on which table.
      Vendor pages gained a *reserve a table* band, shown only where there is a
      floor plan.
      Availability is **derived, never stored** — there is no slot table, only
      opening hours, the C11 floor plan, a `BookingPolicy` and the bookings
      already taken. `lib/reservations.ts` answers the one question that matters
      ("given the book, can this party sit for a full turn starting here?") by
      overlap arithmetic, and allocates tables **best-fit** — smallest table that
      takes the party, joining two in one zone only when no single table fits, so
      a six-top is not burned on a couple. The same functions drive the guest
      grid, the re-check at booking time and the dashboard floor, so those three
      cannot disagree. Status is derived too (C9/C12/C15's pattern): a sitting
      that has elapsed reads `completed`, one never seated reads `no-show`, with
      nothing sweeping the book. Policy is **data**, so a sushi counter (75-min
      turns, 15-min grid, deposit from five guests) and a rooftop trattoria
      behave differently with no branch in any component; Spice Route reviews
      every request instead of auto-confirming. Cutoffs live in the seam — a skip
      past the cancellation window is refused there, not by a disabled button.
      Simulated `services/reservations.ts`; persisted `stores/reservations.ts`
      (the guest's bookings, plus the venue's status changes as overrides on the
      synthesised book). Seeded `lib/mock/reservations.ts` — six policies, and
      the book itself synthesised per request by a deterministic factory anchored
      to `now` (C10's pattern) that seats every generated party through the real
      allocator, so the book never double-books a table and fills to a share of
      each venue's own capacity rather than a flat count. New
      `types/reservation.ts`, `lib/dates.ts` (the plain-date and clock-time
      primitives, extracted from `lib/subscriptions.ts` now that two domains
      share them) and `reservations` i18n namespace (en/bn/ar, full Arabic
      plurals); header nav, account menu/sidebar and the dashboard sidebar gained
      the entries
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
- [x] **Landing surface completed** — every link reachable from the landing page
      (header nav, footer, and each section) now resolves to a real page. This
      slice also lands parts of later phases:
      - **Smart Search** (`/search`) — new `services/search.ts` resolves one
        query across vendors *and* dishes (field-weighted relevance) with URL-
        driven facets: cuisine, dietary, price level, rating, delivery time,
        open-now, free-delivery, has-offers, plus six sort orders. Debounced
        type-ahead (`SearchBox`, request-id guarded), sticky facet sidebar,
        category shortcuts and a suggestion-led empty state. The hero address
        form, category rail and cuisine grid all funnel here. `noindex`
      - **C20 Offers** (`/offers`) — new `Offer` model (discount *rule* +
        eligibility + validity window), `lib/mock/offers.ts` (14 campaigns) and
        `services/offers.ts`. Grouped by placement: flash deals with scarcity
        meters and days-left counters, featured platform offers, copyable coupon
        codes (`CopyCode`), vendor deals, and a rail of vendors running their own
        promotions. Windows are stored as *day offsets* and stamped by
        `buildOffers(now)` in the service, so campaigns are always live and the
        seed never reads the clock (same pattern as `vendor-orders.ts`).
        *Coupons as a redeemable account entity landed in C21, which mints its
        claimable codes from this same seed*
      - **CMS content layer (part of C26)** — `types/marketing.ts` +
        `lib/mock/pages.ts` + `services/pages.ts`: no marketing or legal page
        holds prose of its own, each renders a document from the seam.
        `/blog` + `/blog/[slug]` (9 posts with structured `BlogBlock` bodies,
        category filter, tag-matched related rail, `generateStaticParams`),
        `/about`, `/careers` (7 roles, team filter), `/help` (4 support channels
        + 4 FAQ groups), `/terms`, `/privacy`, and the two acquisition pages
        `/partner` + `/rider` (shared `PitchPage`). Reusable bands live in
        `components/marketing/marketing-blocks.tsx`; FAQs use native
        `<details>` so they work without JS
      - Sitemap now covers all 17 static routes plus vendor, caterer, meal-plan
        and article details. All three locale catalogs stay key-for-key
        identical (1,818 keys as of C21), with full Arabic plural forms
- [x] **C23** Favorites — a heart on every vendor card, menu row, search result
      and the vendor hero. `stores/favorites.ts` persists **ids only** (newest
      first) and `services/favorites.ts` re-joins them to entities, dropping and
      counting ids that no longer resolve, so a renamed or delisted item can
      never go stale in the store. Saving requires a session. `/account/favorites`
      tabs places vs dishes, defaulting to whichever has content. `VendorCard` was
      restructured (wrapper + inner link) so the heart is a real sibling button
      rather than a button nested in an anchor
- [x] **C28** Settings (`/account/settings`) — new `types/settings.ts`,
      `lib/mock/settings.ts` (opinionated defaults: transactional on, marketing
      off), `services/settings.ts` and persisted `stores/settings.ts`. Sections:
      **appearance & region** (three-way system/light/dark, language, currency),
      **notifications** (5 topics × email/push/SMS as a real table; order email
      is locked, per `REQUIRED_NOTIFICATIONS` on the seam), **privacy**,
      **security**, **password change** (service-owned validation returning i18n
      keys) and a **danger zone** — JSON data export, sign-out-everywhere, and
      account deletion gated on typing the account email. Every toggle saves on
      change, optimistically, then commits the service's echo (and rolls back on
      error) — no Save button to lose. Theme/language/currency are *not* stored
      here: the new `lib/theme-preference.ts` owns the preference contract
      (absent key = follow OS), so the header toggle, the pre-paint
      `ThemeScript` and this page all drive one owner
- [x] **C18** Delivery Rider App (`/delivery`) — the courier side, in its own
      `(rider)` route group with a phone-shaped shell: a compact top bar carrying
      the one control that matters all day (on shift / off shift), a bottom tab
      bar, and a persistent pointer back to a trip in progress. **Today** leads
      with the shift, then what the day has paid, then the trips on offer — each
      offer card answering the four questions a rider has before their thumb
      moves (what it pays, how far, how many drops, how much cash) against a
      countdown. **Running a trip** (`/delivery/trip/[id]`) is a checklist with a
      map: only the next stop is actionable, a pickup completes in one tap, and a
      drop goes through the handoff sheet. **Earnings** breaks the money into the
      four things that generate it over today / week / month, **Wallet** keeps the
      two balances apart (what the platform owes the rider, and the cash the
      rider owes the platform), **Trips** is the week day by day, and **Profile**
      owns the vehicle, the zone and the documents — beside the zone's fare card,
      so a rider can see the rule that produced their last payout.
      The unit of work is a **trip, not an order**, which is what makes *batch
      delivery* a data shape rather than a special case: two orders are four
      stops through the same router. `lib/delivery.ts` **computes the route**
      (nearest-feasible-first with one hard constraint — you cannot deliver what
      you have not collected), and does it over the real coordinates the catalog
      already holds, so distance, ETA and pay all follow from the same geometry
      the map draws. Fares are **data** (`lib/mock/delivery-zones.ts`): a
      sprawling suburban zone pays more per kilometre, peaks at different hours
      and lets riders hold more cash than an inner-city one, with no branch in any
      component. **Handoff codes are derived from the order id**, so the rider's
      app and the customer's tracker (C9, which now shows the code) agree with
      nothing shared between them — and the seam refuses a delivery on a wrong
      code, or one where owed cash was not confirmed, or a stop taken out of
      route order. Cash is treated as a debt with a zone ceiling: past days are
      settled at end of shift, today's is what the wallet asks the rider to hand
      in. Simulated `services/delivery.ts`; persisted `stores/rider.ts` (shift,
      the accepted trip captured whole, declined offers, hand-ins, cash-outs) fed
      back as `RiderContext`. Trips are synthesised per rider by a deterministic
      factory anchored to `now` (C10's pattern) whose orders are priced through
      checkout's own `computeTotals`, so what a rider collects on a cash order is
      a genuine order total. New `types/delivery.ts`, `lib/mock/rng.ts` (the
      seeded PRNG, extracted now that a third domain synthesises data) and
      `delivery` i18n namespace (en/bn/ar, full Arabic plurals); the account menu
      routes riders here instead of the merchant dashboard, and `/rider` gained an
      "already a partner?" way in
- [x] **C21** Coupons — the redeemable half of a promotion, on both sides.
      An **offer** (C20) is a campaign the platform advertises; a **coupon** is a
      ticket a customer holds. The rule lives on `Coupon`, everything personal —
      when it was claimed, what it has been spent on — lives on a `CouponClaim`,
      one row per customer per coupon, exactly as a `coupons` + `coupon_claims`
      pair of tables would. Campaign coupons are **minted from the offer seed**
      (every offer carrying a code), so the terms on the deals page and the terms
      on the ticket in a wallet are the same row and cannot drift; granted
      coupons — a welcome gift, a referral reward, an apology credit after a late
      delivery, a birthday freebie, a loyalty cashback — have no campaign behind
      them and are issued, not claimable.
      **Status is derived, never stored** (the C15/C16 convention): a coupon reads
      expired because its window closed and spent because its redemptions reached
      the limit, with nothing sweeping a table to make that true. There is exactly
      one evaluator (`lib/coupons.ts`) and every surface asks it the same question,
      so a coupon the checkout picker offers is one the seam will accept: it
      prices all five kinds — percentage (with a cap), fixed, free delivery, BOGO
      (the cheapest item in the basket) and **cashback, which is deliberately not
      a discount** but a wallet credit paid after the order, so it never flatters
      the total — and refuses in the order a person would explain it: what is
      wrong with the coupon, then with the basket, then the kind-specific
      conditions, first failure wins.
      **Customer:** `/account/coupons` (claim a code, three tabs — available,
      used, expired — and a rail of codes still claimable), a **coupon step at
      checkout** replacing C8's hard-coded promo table (typed codes are claimed on
      the spot by the seam; the sheet lists what *doesn't* apply too, each with its
      reason, and the code the basket outgrows is dropped with an explanation), a
      "save to my coupons" button beside every code on `/offers`, and the code on
      the receipt. **Merchant:** `/dashboard/coupons` — the vendor's own codes with
      derived status and performance, an issue form whose validation lives in the
      seam (codes are unique platform-wide), and *ending* a campaign closes its
      window rather than deleting it, so it stays readable and its redemptions keep
      counting. Simulated `services/coupons.ts` (owns the clock, the rules and the
      joins — it derives the basket's categories and delivery fee itself, so no
      component can mis-state what a coupon was priced against); persisted
      `stores/coupons.ts` holds claims only, and the merchant's created/ended
      coupons ride on `stores/merchant.ts` as the seam's context parameter (the
      C16/C18 pattern). New `types/coupon.ts`, `lib/mock/coupons.ts` and `coupons`
      i18n namespace (en/bn/ar, full Arabic plurals); account sidebar/menu and the
      dashboard sidebar gained the entry
- [x] **C34** Order Lifecycle — the spine the four surfaces now share. Audit in
      `ORDER-LIFECYCLE-AUDIT.md`; what it found was that the customer, the
      restaurant and the rider were three unrelated simulations (a clock-derived
      status, a `useState` array over a per-visit synthesiser, and a pool of
      invented trips), so nothing any actor did was visible to any other.
      **`lib/order-machine.ts`** now owns the lifecycle: 16 states (the spec's
      full path plus `packing`, `rider-assigned`, `arrived`, `completed` and the
      distinct failure endings `rejected` / `delivery-failed` / `returned` /
      `refunded`), an explicit transition graph, per-actor permissions, and a
      pure `transition()` that refuses illegal moves and stamps the derived
      fields (promised-ready time, OTP verification, COD settling on delivery).
      **`stores/orders.ts`** became the single source of truth all four surfaces
      read and write, with an append-only event log per order, a persisted-store
      migration for pre-lifecycle orders, and a seeded working set
      (`lib/mock/demo-orders.ts`) covering every interesting state. Every
      committed transition emits role-scoped notifications
      (`lib/notifications.ts` → `stores/notifications.ts`, bell in all four
      shells). **Customer** (`/orders/[id]`) reads real status, shows a kitchen
      countdown against the promise, meets the rider at assignment, and sees the
      handoff code only once the rider arrives. **Restaurant**
      (`/dashboard/orders`, new `/dashboard/kitchen`) accepts with a prep time,
      rejects/cancels with a reason, walks preparing → packing → ready, and
      dispatches automatically or by hand. **Rider** (`/delivery`, new
      `/delivery/order/[id]`) takes real orders and closes them through an
      attempt-counted OTP with a lock-out and a failed-delivery fork. **Admin**
      (new `(admin)` group, `/admin`) is the live-ops board. Shared
      `components/orders/*` (animated timeline, status chip, dialogs);
      `lib/tracking.ts` now reads the event log instead of interpolating the
      clock; `lib/analytics.ts` excludes all failure states from revenue.
      `components/demo/*` adds an autopilot that plays the actors a presenter
      is not — through the same store actions, so it has no privileged path.
      New `notifications` / `admin` / `demo` i18n namespaces (en/bn/ar)
- [ ] **C19, C22, C24–C27, C29–C33 (remaining)** wallet UI, reviews, AI assistant,
      full CMS admin, deeper analytics, a11y/perf review
- [ ] **D / E** Backend architecture & implementation (after prototype is complete)

### Known stubs (expected at this stage)

**Every link on the landing page now resolves** — header nav (`/restaurants`,
`/cafes`, `/home-chefs`, `/cloud-kitchens`, `/meal-plans`, `/catering`,
`/offers`), footer
(`/about`, `/careers`, `/help`, `/terms`, `/privacy`, `/partner`, `/rider`), the
hero/category/cuisine funnels into `/search`, and the blog teaser into `/blog`
and `/blog/[slug]`.

**Every link in the signed-in account menu now resolves too** — `/account/favorites`
(C23), `/account/settings` (C28) and `/account/subscriptions` (C15) landed, so
there are no known 404s left in the customer app. The vendor dashboard (`/dashboard`,
`/dashboard/orders`, `/dashboard/menu`) is live behind the sign-in + management-role
gate (sign in as `owner@foodora.dev` / `demo1234`). The customer app (`/account`,
`/account/orders`, `/account/subscriptions`, `/account/favorites`,
`/account/addresses`, `/account/wallet`, `/account/settings`) is live behind the
sign-in gate. Auth is fully simulated (no backend/JWT): any seeded account signs in
with password `demo1234`, OTP accepts `123456`, social buttons resolve to the
demo customer. The cart is live (add from any menu, single-vendor) and checkout is live
(`/checkout` → place order → `/checkout/success`). Placed orders persist in the
orders store; the confirmation screen's "Track your order" button opens
`/orders/[id]`, the live tracker (C9) — it resolves orders placed on *this*
device (the persisted store) and shows a not-found state for unknown ids.
The QR menu (C12) needs no account at all — open
`/m/bella-napoli?t=tbl_bella_napoli_t3` to sit at table T3, or
`/m/the-daily-grind` for a browse-only venue. A table sitting lives on the
device that scanned it, so the bill does not follow a guest to a second phone
and staff cannot see the round land anywhere yet; the kitchen-side ticket feed
arrives with the Kitchen Display surface.
Meal plans (C15) are browsable signed-out, but subscribing needs an account —
try `/meal-plans/lean-and-green`, then `/account/subscriptions` to skip a day or
pause. A subscription is device-local like an order, nothing is charged, and no
renewal actually fires: the calendar is projected from the start date and the
clock, so "next delivery" is always right without a scheduler. The kitchen has
no production view of its subscribers yet.
Table booking (C16) is browsable signed-out and bookable with an account — try
`/reservations` (change the party size and watch the times change), or go straight
to `/restaurants/bella-napoli/book`; `/restaurants/spice-route/book` is the venue
that reviews requests rather than confirming instantly, and
`/restaurants/sakura-sushi/book` with five guests is the one that asks for a
deposit. The venue's own book is `/dashboard/reservations` (sign in as
`owner@foodora.dev`, which owns Bella Napoli). Honest limits: a booking is
device-local like an order, so the venue cannot really see a guest's booking and
the guest cannot see the venue confirm it — the two sides share the *derivation*
but not a database. The rest of each venue's book is synthesised per request, so
it is coherent and stable for a given day but is not a real ledger: status
changes the floor makes are kept as overrides in the browser, and no deposit is
ever charged or held.
The rider app (C18) is at `/delivery` — sign in as `rider@foodora.dev`, go on
shift, and take one of the offers (the second one is a batch of two orders, so the
multi-stop route is always there to try). The four-digit code a drop asks for is
the same code the customer's tracker shows, because both derive it from the order
id — open `/orders/[id]` on an order that is on its way to read it. Honest limits:
a trip is device-local like an order, so a vendor cannot really see a rider accept
their order and the customer cannot watch this rider move; the two sides share the
*derivation*, not a database. The week of trips behind earnings is synthesised per
rider — coherent and stable for a given day, but not a ledger — and no cash, hand-in
or withdrawal moves real money. Documents are read-only: upload is support's job in
the prototype. Fleet management (assigning riders, watching the map) belongs to the
admin console, not here. Review entities are deferred to their
phases; the *types* exist so services are ready. Settings that need a server to mean anything (notification channels,
privacy flags, 2FA) persist locally and would be sent verbatim to the Phase E
endpoints; account deletion clears every persisted customer store but has no
server-side retention window yet.
