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
    about|careers|help|contact|terms|privacy|refund|partner|rider/
                        CMS-backed pages (every word of them a document, C26)
    account/            private customer app behind a client auth gate: profile,
                        orders, subscriptions, reservations, favorites, reviews,
                        addresses, wallet, coupons, settings
  (admin)/              platform operations (route group) — live ops, the
    admin/              notification centre, and the CMS (cms/[collection]/[doc])
  (dashboard)/          vendor dashboard (route group) — own sidebar + topbar shell
    dashboard/          overview, orders, menu (C10), pos (C11), qr studio (C12),
                        reservations book (C16), coupons (C21), reviews (C22)
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
  wallet.ts             wallet rules — cover/shortfall, the settle guard,
                        summary + month grouping (C19)
  reviews.ts            the rating engine — one summariser every surface shares,
                        histogram from a stored aggregate, review windows (C22)
  notifications.ts      who hears about what (the fan-out tables) and on which
                        channel (`channelsFor` — the one preference gate) (C25)
  cms.ts                the content rules — localized-text resolution (authored →
                        message key → default locale), patch merge, derived
                        publication status, coverage, validation, and the
                        projections that turn a generic document into the domain
                        type each surface renders (C26)
  push.ts               the browser's own Notification API, feature-detected (C25)
  mock/                 seed data — the ONLY place demo data lives

services/                async data seam — components call THESE, never lib/mock directly
  http.ts               mockDelay(), paginate(), Result envelope
  catalog.ts            getVendors/getTrending/getCuisines/... (backend-ready signatures)
  content.ts            getTestimonials/getBlogPosts/getRelatedPosts (social proof + blog)
  search.ts             smart search across vendors + dishes, with facets & sorts
  offers.ts             promotions grouped by placement; owns the clock (C20)
  coupons.ts            the coupon wallet: claim / price against a basket / redeem,
                        plus the merchant's own codes (C21)
  pages.ts              marketing/legal pages, projected from CMS documents
  cms.ts                the content seam: collections, documents, drafts,
                        publishing, revisions, the audit log, per-route SEO and
                        the contact form (C26)
  favorites.ts          re-joins saved ids to vendors/dishes, drops stale ones (C23)
  settings.ts           account settings, password change, closure (C28)
  wallet.ts             the wallet read, plus top-up and wallet-payment
                        authorisation — both can decline (C19)
  vendor.ts             vendor dashboard reads — stats/charts/best-sellers/orders (Phase C10)
  pos.ts                counter catalog/tables + simulated completeSale (Phase C11)
  qr.ts                 QR menu config, scanned-table resolution, rounds, service calls (C12)
  subscriptions.ts      meal plans, tiers, weekly menus + subscribe/skip/pause/cancel (C15)
  reservations.ts       bookable venues, availability, book/cancel + the venue's book (C16)
  delivery.ts           rider + zone, trip offers, running a trip, earnings,
                        wallet / cash hand-ins (C18)
  reviews.ts            the review corpus + its aggregate, writing/editing a
                        review, helpful votes and the merchant's replies (C22)
  notifications.ts      the feed (filtered, faceted, paged), the delivery log,
                        broadcast segments and the validated send (C25)

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
  reviews/              stars (display + picker), rating summary w/ histogram,
                        review card (one card for all four surfaces), media
                        lightbox, the write/edit dialog, vendor band (C22)
  cms/                  how a published edit reaches the public site: the
                        seed-in/effective-out hooks, plus the promo strip (C26)
  admin/cms/            the content desk: overview + audit, collection list, the
                        one schema-driven document editor, field editors (C26)
  notifications/        the bell (all four shells), one row every surface draws,
                        the account centre + delivery log, the push permission
                        card, and the bridge that draws the OS banner (C25)
  blog/                 post-card, post-body (structured BlogBlock renderer)
  marketing/            marketing-blocks (hero/stats/values/steps/faq),
                        legal-document, pitch-page (/partner + /rider)
  dashboard/            vendor dashboard: shell, stat-card, revenue/peak charts,
                        best-sellers, orders-board, menu-manager (C10), pos/ (C11),
                        qr/ studio + print sheet (C12),
                        reservations/ book + floor view (C16),
                        coupons/ manager + issue form (C21),
                        reviews/ board + reply form + rating trend (C22)
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
      simulated top-up — *made spendable in C19*). New `Wallet` types; `account`
      i18n namespace expanded (en/bn/ar)
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
        identical (2,141 keys as of C19), with full Arabic plural forms
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
- [x] **C19** Wallet — the wallet stopped being a statement and became a tender.
      C3 gave it a balance, a ledger and a top-up button; nothing could spend it,
      and checkout offered a "wallet" tender against a hard-coded `2450` that
      disagreed with the store the moment anyone topped up. Now the money is real
      in both directions and there is **exactly one way it moves**: the store
      appends a *signed transaction* and re-sums, so the balance cannot drift from
      the ledger and there is no setter that could let it. Every post is
      order-scoped and guarded by the ledger itself (`isSettled`), which is what
      makes a persisted, multi-tab, autopilot-driven prototype safe to replay: an
      order can be charged once and refunded once, however many times its status
      change is re-committed.
      **Spending** — the checkout tender reads the live balance, refuses to be
      picked when it cannot cover the order and says *by how much* it falls short.
      The chosen tender is **derived, not stored**: adding a tip or losing a coupon
      raises the total, so `payment === "wallet"` silently resolves to cash the
      instant it stops being affordable, leaving no window where the selection is
      stale. The rule is enforced again in `services/wallet.authoriseWalletPayment`
      — a disabled button is a courtesy, not a control — and the debit is posted
      against the order number, so the receipt and the ledger row are the same
      payment.
      **Refunding** — a wallet payment is the one tender this app can actually
      reverse (the money is in a ledger it owns), so a wallet-paid order that ends
      badly is refunded *automatically, as part of committing the transition*
      rather than by whichever surface happened to cancel it: `stores/orders.ts`
      credits the wallet and follows through to `refunded`, so the customer is told
      via the same notification path as every other status. Cash was never taken
      and a card refund is a bank's business — both keep the "requested → pending"
      path. The tracker now distinguishes the two.
      **The surface** — `/account/wallet` became the statement behind those
      payments: a thirty-day money-in/money-out summary, a type filter, months as
      headings, a low-balance nudge, and a top-up that takes a custom amount and a
      funding method through a gateway that can decline (amount `1234`, the
      reserved-failure trick C8 uses for cards). New `lib/wallet.ts` (the pure
      rules every surface shares — cover/shortfall, summarise, group, the settle
      guard) and three new seam functions in `services/wallet.ts`; `account`,
      `checkout` and `tracking` i18n extended (en/bn/ar)
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
- [x] **C22** Reviews — the customer's half of a finished order, on every side.
      A review *is* an order that came back with an opinion: the `orderId` is what
      makes it verified, what stops the same order being rated twice, and what
      lets a merchant answer a real customer rather than an anonymous star. One
      form writes **two rows** where a courier was involved (`Review.subject`) —
      a late rider is not the kitchen's fault and cold food is not the rider's —
      which is why the same card renders on the storefront, in the account, on
      the merchant's board and in the rider's profile.
      **The aggregate is derived, never stored** (`lib/reviews.ts` is the only
      place an average, a histogram or an aspect score is calculated, and every
      surface calls it). The catalogue's `rating` / `reviewCount` are the
      denormalised counters a backend keeps beside the table — nobody runs
      `AVG()` over 3,410 rows on a page view — so `distributionFromAggregate`
      reconstructs the histogram those two numbers imply (bell, floor, then whole
      reviews moved between adjacent buckets until the histogram's own mean *is*
      the stored average) and `summariseVendor` folds in whatever this device
      wrote. In Phase E the reconstruction is deleted and replaced by one
      `GROUP BY rating`; every caller keeps its signature. The corpus itself is
      synthesised per vendor (`lib/mock/reviews.ts`, mulberry32 anchored to `now`,
      the C10/C16/C18 pattern) and **draws its stars from that same histogram**,
      so the page of reviews can never contradict the number printed above it.
      **Rules live in the seam, not in disabled buttons:** rating an order that
      never arrived, rating it twice, editing one the restaurant has already
      answered publicly (the reply locks the review — a public answer to specific
      words), voting on your own review, voting twice, replying twice, replying to
      another restaurant's review — every one is refused by `services/reviews.ts`
      with an i18n key, and the 30-day window is re-checked at submit because a
      form can sit open past midnight.
      **Customer:** a reviews band on every restaurant page (summary + clickable
      histogram + aspect averages + what people keep saying + "most loved dishes"
      joined back to the menu, filter by star / photos, four sorts, helpful votes,
      report, load more), a write/edit dialog that asks for the overall star first
      and only then offers the half of the tag vocabulary that agrees with it
      (`tagsForRating`), photo attachments (spec: Photo Review — video is the same
      row with a poster frame), a courier score, and `/account/reviews` (orders
      still owed a rating with their days remaining, then everything written, each
      editable until answered). **Merchant:** `/dashboard/reviews` — the same
      corpus and the same summary the storefront reads, a six-month rating trend
      pinned to the 1–5 domain, tabs that default to *needs a reply*, and an
      inline public answer. **Rider:** recent feedback on `/delivery/profile`.
      New `types/review.ts`, persisted `stores/reviews.ts` (reviews written here,
      helpful votes, reports — deletions are soft, because the row is what proves
      an order was already reviewed); merchant replies ride on `stores/merchant.ts`
      and are joined into the seam's `ReviewContext` by `useReviewContext`, so a
      reply written in the dashboard shows up for the customer. New `reviews` i18n
      namespace (en/bn/ar, full Arabic plurals); account + dashboard sidebars
      gained the entry. Review *notifications* are deliberately left to C25
- [x] **C24** AI Assistant — the whole "AI Features" block of the spec (Food
      Assistant, AI Chat, AI/Meal/Restaurant Recommendation, Mood & Budget Based
      Search, Allergy Warning, Nutrition Analysis, Diet Planner, AI Search, Voice
      Search, Image Search, Food Recognition, OCR Menu Scanner, AI Review
      Summary), built on one claim: **there is no model, and the assistant never
      pretends there is one.** A deterministic parser turns a sentence into
      *the search page's own facets* — `lib/ai.parseRequest` → `RequestConstraints`
      → `searchHref`, so anything it can answer is also a link the customer can
      open and refine by hand, and it has no private notion of what a dish is.
      That hand-off *is* the AI Search feature, and it is why the assistant can
      never surface a dish the catalogue would not.
      **A reply is a key plus data, never a sentence.** `AssistantSay` is an i18n
      key and its ICU values; `AssistantBlock`s are typed cards holding **ids
      only** (the C23 favorites rule). So a thread restored from localStorage
      next week shows today's prices, and *re-reads itself in Bangla* if the
      locale changed meanwhile — which stored prose never could. The seam embeds
      the entities it referenced (`AssistantReply.entities`), exactly as a chat
      endpoint would; `resolveEntities` is the batch fetch on rehydrate.
      **Nothing derived is stored, and every estimate says so.** The seed gives a
      dish a name, a description and a calorie count; `lib/nutrition.ts` infers
      the rest. Macros come from an energy *split* per dish class (fried, salad,
      dessert, grain…) nudged by dietary tags, so `4·protein + 4·carbs + 9·fat`
      lands back on the stated calories — an estimate that contradicts the number
      beside it is worse than none (script-verified across all 75 dishes).
      Allergens are keyword-inferred and deliberately over-report, with a vendor's
      own dietary tag outranking a guess made from an adjective (a vegan curry is
      not flagged for dairy). The haystack reads the **slug** as well as the prose:
      "Margherita DOP — fior di latte, San Marzano, basil" never says *pizza*, so
      a gluten screen on the description alone cleared it — `pizza-margherita`
      does not. Confidence is reported (`high`/`medium`/`low`) and the UI labels
      every figure an estimate.
      **Rules live in the seam.** `services/ai.ts` refuses an empty message, a
      paragraph, an unsupported file, an oversized image and an out-of-range plan
      with i18n keys — and enforces the one rule that matters most in a single
      place: when C28's `personalizedRecommendations` is off it drops every id
      the device handed it, so the privacy switch changes the *answer*, not just
      what persists. Allergies survive it: they are safety, not personalisation.
      When the hard filter leaves too little, the seam relaxes **price first, then
      mood, never the diet or the allergens**, and says which concession it made.
      **Surfaces:** a slide-over panel on every public page (`CartDrawer`'s
      behaviour, not a second overlay), the `/ai` hub (same thread, plus the
      profile and a 1/3/7-day planner), an AI review summary band on every
      restaurant page (client-side, through C22's own seam, so it and the review
      list beneath it read the same corpus), and the search page's "I read that
      as" note. **Voice search is genuinely real** — the browser's own Web Speech
      API, nothing uploaded, and the button hides itself where support is absent;
      it fills the composer rather than sending, because speech mishears. Image
      recognition is honest instead: a deterministic fingerprint (the file never
      leaves the browser), a filename that really is read, and a confidence
      capped at 0.72 when it was a draw. The diet planner is **projected, never
      stored** (the C15 rule) — greedy best-fit per slot against the goal's
      calorie target, no dish or kitchen twice in a day.
      New `types/ai.ts`, `lib/nutrition.ts` (`sumNutrition` moved out of
      `lib/subscriptions.ts` into `totalNutrition`, the `lib/dates` precedent),
      `lib/ai.ts`, `services/ai.ts`, persisted `stores/assistant.ts` (thread +
      food profile; entities are a cache and are deliberately *not* persisted),
      13 components under `components/ai/`, the `/ai` route, and a new `ai` i18n
      namespace — catalogs now **2512 keys**, key-for-key identical across
      en/bn/ar with full Arabic six-form plurals; all 69 literal lookups, 59
      seam-emitted keys and every dynamic vocabulary group script-verified to
      resolve. Quick-prompt chips carry a *localised label and a fixed English
      phrase*, which is the localised path into an English-first parser.
      tsc + eslint clean; `scripts/ai-flow.ts` is a **119-assertion** flow check
      over parser, macros, allergens, planner, composer, privacy, recognition,
      review summary and AI search; routes 200 in en/bn/ar
- [x] **C25** Notifications — the order lifecycle already emitted role-scoped
      messages; C25 turned that into a **platform service** with one rule at the
      centre: **a preference decides where a notification goes, once, at emit.**
      `lib/notifications.channelsFor` is the only function in the codebase that
      reads C28's topic × channel matrix, `stores/notifications.notify` is the
      only door into the feed, and every domain store calls it after a committed
      change. So the settings table stopped being decorative: switch promotions
      off and a claimed coupon never reaches the inbox at all; switch it on and
      it arrives on exactly the channel that was ticked. The locked
      order-receipt email (`REQUIRED_NOTIFICATIONS`) is enforced in that same
      function rather than described by the page that draws it.
      **What a notification is** was generalised past orders — a `category`
      (order / delivery / payment / review / reservation / subscription /
      catering / promo / system), a typed `subject`, and the `channels` it
      actually went out on, recorded on the row because *"why didn't I get an
      email"* must not be re-derived from preferences that have since changed. A
      persisted-store migration carries pre-C25 rows across rather than emptying
      an inbox on upgrade. Six domains now emit: the lifecycle fan-out (plus a
      **review invite** on delivery — the notification C22 deferred to here),
      wallet top-ups/refunds/cashback (but *not* the debit the customer watched
      happen), coupon claims, bookings on both sides, meal-plan state changes
      (a skipped day is not one), and catering quotes. Every emit is after the
      write commits, never inside a `set` updater — an updater can be replayed
      and a notification is not idempotent.
      **Three channels, and only one of them is real, which the UI says.** Push
      is the browser's own `Notification` API — a genuine permission, a genuine
      OS banner, feature-detected and hidden where unsupported (the C24
      voice-search rule), suppressed while the tab is visible, and honest that
      without a service worker nothing arrives once the tab is closed. Email and
      SMS produce the **delivery log** a provider integration would: one row per
      channel *considered*, so a suppressed row with a reason replaces silence.
      Rows store keys, not prose, so the log re-reads itself in the current
      locale. Push is drawn by `PushBridge` in the React tree, not the store —
      only a tree holding the catalog can turn a key into a sentence, and that
      keeps the store's decision and the banner's wording in separate places
      with no second policy.
      **Surfaces:** the bell in all four shells became a peek with a "see all"
      (only for the two roles that have a centre — a restaurant's inbox *is* its
      dashboard); `/account/notifications` is the customer's record, with
      category facets computed over the whole inbox rather than the filter, an
      unread filter, and the delivery log as its second tab; `/admin/notifications`
      is the spec's **Notification Center** — a composer whose job is to make the
      cost of a message visible *before* it is sent (segment size, a live SMS
      counter that turns red at 161 because that is where one message becomes
      two, and a reachable count that moves when promotion becomes announcement),
      plus campaigns and the platform log. Its broadcast goes through the same
      gate as everything else, so a promotion to a device with promotions off
      lands nowhere — exactly what the segment maths predicted. `/admin` gained
      a nav to hold the second page.
      New `lib/push.ts`, `services/notifications.ts`, six components under
      `components/notifications/`, `components/admin/notification-center.tsx`;
      `types/notification.ts`, `lib/notifications.ts` and `stores/notifications.ts`
      rewritten. Catalogs now **2672 keys**, key-for-key identical across en/bn/ar
      with full Arabic six-form plurals. tsc + eslint clean;
      `scripts/notifications-flow.ts` is a **116-assertion** flow check over the
      routing gate, the fan-out, every non-order source, the outbox, the feed
      seam, broadcast validation, the wired-up store, and that all 170 emitted
      message paths resolve with every placeholder filled in all three locales;
      routes 200 in en/bn/ar
- [x] **C26** CMS — the spec asks for one thing (*every content should be
      dynamic, nothing hardcoded*), and thirteen bespoke editors would have
      satisfied its letter and none of its spirit. So the CMS is
      **schema-driven**: a collection declares its fields, a document holds
      values against them, and **one editor renders all nine collections** —
      banners, pages, legal documents, blog, FAQs, categories, navigation, SEO
      records and the site record. Adding a field is a line in
      `lib/mock/cms.ts`, not a new form.
      **A document is generic; the typed shape is a projection.** `values` is a
      map, not a `LegalDoc`, and `lib/cms.ts` projects it back into the domain
      type each surface already renders (`LegalDoc`, `FaqGroup`, `BlogPost`,
      `Category`, `SupportChannel`…), so **no component learned that a CMS
      exists**. `services/pages.ts`, the blog half of `services/content.ts` and
      `catalog.getCategories` were rewritten as projections of these documents
      and kept their signatures — which was the point of putting a seam there in
      C1. The seed is *derived* from the arrays those services used to read, so
      no prose exists twice and the page cannot disagree with what the editor
      sees; the only new content is what did not exist before the phase (the
      contact page, the refund policy, four promotional banners, the SEO records).
      **Text is localized with a message key behind it.** A field holds one
      string per locale, and a document may declare a `fallbacks` key per field;
      `resolveText` resolves *this locale's authored text → the field's message
      key (itself translated) → the default locale's text*. Consulting the key
      **before** falling through to English is what lets the CMS take ownership
      of copy that lives in three catalogs — the landing hero, every nav label,
      each page's eyebrow — **without duplicating one translated string**, and
      why an English override cannot silently untranslate Bangla. Coverage is
      reported per locale, and neither a key-backed field nor an empty optional
      one counts as a gap: one is already translated, the other is unused.
      **Publication is derived, never stored** (the C15/C16/C21 convention): a
      window that has not opened reads `scheduled` — the seeded festival banner
      publishes *itself* three weeks from now with nothing flipping a flag — one
      that has closed reads `expired`. Draft and published are separate values,
      so the site keeps serving the published version until someone presses
      publish, and a change can be discarded without leaving a revision. A
      publish snapshots what it replaced, which makes **revert** a real action
      rather than an undo stack that dies with the tab, and every write lands in
      an **audit trail** (spec: Audit Logs). Rules live in the seam: required
      fields, lengths, link shapes, slug format, platform-unique handles,
      backwards windows and locked structural documents are all refused there
      with i18n keys — the editor's inline errors come from the *same* pure
      function, because a form open since before a field became required is
      exactly the case a disabled button does not cover.
      **Surfaces:** `/admin/cms` (collections, what is waiting to publish, the
      audit log, and the messages the contact form took), the collection list
      (status, pending draft, translation coverage, ordering where order means
      something) and the editor (locale tabs, schema-driven fields with a
      repeater, publish bar, version history). On the public side the landing
      hero and a new promotional strip, the craving rail, header/footer
      navigation and the footer's brand line, `/terms` `/privacy` and the new
      `/refund`, the help centre's channels and FAQs, every marketing page's
      hero and repeating bands, the blog index and article, and the new
      **`/contact`** — whose form is validated by the seam and lands in
      operations' inbox through C25's own notification gate. SEO metadata is
      resolved server-side from the published document, which is a stated limit
      rather than an oversight: metadata renders before any browser storage
      exists. New `types/cms.ts`, `lib/cms.ts`, `lib/mock/cms.ts`,
      `services/cms.ts`, `stores/cms.ts`, `components/cms/*` (the client layering
      hooks + promo strip) and `components/admin/cms/*`; `constants/navigation.ts`
      now carries icon *names* and is the seed the menu documents are built from.
      Catalogs now **2820 keys**, key-for-key identical across en/bn/ar with full
      Arabic six-form plurals. tsc + eslint clean; `scripts/cms-flow.ts` is a
      **177-assertion** flow check over the seed, text resolution, every
      projection, derived status, coverage, validation, the
      draft→publish→revert→discard cycle, unpublish/archive/create/reorder, the
      public seam, the pages it now feeds, and that all 188 reachable message
      paths resolve with every placeholder filled in all three locales; routes
      200 in en/bn/ar
- [ ] **C27, C29–C33 (remaining)**
      deeper analytics, localization/dark-mode/responsive/a11y/perf review
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
`/account/reviews`, `/account/notifications`, `/account/addresses`,
`/account/wallet`, `/account/settings`)
is live behind the
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
phases; the *types* exist so services are ready. Settings that need a server to
mean anything (privacy flags, 2FA) persist locally and would be sent verbatim to
the Phase E endpoints; account deletion clears every persisted customer store but
has no server-side retention window yet. **Notification channels stopped being
one of them in C25** — the matrix on `/account/settings` now decides what the
inbox actually receives.
Notifications (C25) are at `/account/notifications` for the customer and
`/admin/notifications` for operations (sign in as `admin@foodora.dev`); the bell
in every shell is the same feed. To watch the preference gate work, open
`/account/settings`, turn *Offers & promotions* on for one channel, claim a coupon
from `/offers`, and it appears — turn it off and the same claim reaches nothing.
Honest limits: **push is real, email and SMS are not.** Push is the browser's own
`Notification` API with a genuine permission prompt, but there is no service
worker or push service, so a banner only arrives while the site is open in a tab,
and the card says so. Email and SMS are never sent to anyone: what exists is the
**delivery log** — the rows a provider integration would have produced, including
the suppressed ones and the reason, which is what makes the preference matrix
legible. Segment sizes in the admin composer are a demo population from a fixed
seed (restaurants and riders are counted for real), a broadcast reaches exactly
the one inbox that exists on this device, and nothing is scheduled: a campaign is
sent when the button is pressed.
The food assistant (C24) is at `/ai`, or behind the floating button on any
public page — try "something cheap and vegan, no peanuts", "comfort food for a
rainy evening", "how many calories is the Margherita DOP", or "plan my meals for
5 days". Honest limits, and the UI states each of them rather than hiding them:
**there is no language model.** The parser reads keywords, which makes it precise
about filters (a budget, a diet, an allergen, a named dish) and useless at
conversation — it has no memory of the previous turn and cannot be argued with.
It is also English-first: the localised quick chips exist so a Bangla or Arabic
speaker has a working path, and they send a fixed English phrase. **Macros and
allergens are inferred**, from each dish's own words rather than declared by the
kitchen, so the assistant labels them estimates, over-reports allergens on
purpose, and tells the customer to confirm with the restaurant — never rely on it
for a real allergy. **Photo recognition is a fingerprint, not vision**: the same
photo always gives the same answer and a filename that names a dish really is
read, but an anonymous photo is a deterministic draw and says so with a
confidence below 0.72. Voice input is the exception — it is the browser's own
speech recognition, genuinely working, with nothing uploaded (the button hides
itself where the browser has no support). The conversation, the food profile and
any plan are device-local like an order, so nothing is shared between phones and
no plan is ever scheduled or charged.
The CMS (C26) is at `/admin/cms` (sign in as `admin@foodora.dev`). To watch it
work end to end, open **Banners & promotions → the landing hero**, change the
headline, press *Save draft* — the landing page is unchanged, because a draft is
not published — then *Publish*, and the new headline is on `/`. Switch the locale
to বাংলা and the hero reads its Bangla translation again: the field you overrode
was English, and a key-backed field keeps every locale you did not touch. *Restore*
in the version history puts the old headline back and keeps both versions. The
seeded **festival banner is genuinely scheduled** three weeks out, so it appears
in the admin as scheduled and nowhere on the site; the free-delivery strip has an
open window and does. Honest limits: **publishing is real, but it is local to this
browser.** It is versioned, reversible and written to the audit trail — the
overview says so in as many words — but there is no content server, so a colleague
on another device still sees the seeded content, and *Reset all content* returns
this device to the seed. **SEO metadata is the one surface a local edit cannot
change**: `<head>` is rendered before any browser storage exists, so the admin's
SEO records are read from the published seed and the editor says so. Two seams
still read the category seed directly rather than the CMS — the coupon engine's
basket-category matching and the assistant's parser vocabulary — so renaming a
category's *search keywords* changes the landing rail and `/search` but not those
two, which is a Phase E join rather than a second copy of the content. The contact
form validates for real and records the message (it shows up on `/admin/cms` and in
the admin bell through C25's gate), but **nothing is emailed to anyone** — there is
no mail provider, and the page states it above the button.
