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

types/                   domain models (BaseEntity w/ soft-delete + audit fields)
components/
  ui/                   primitives: button, badge, rating, toaster, theme-toggle, locale-switcher
  layout/               site-header, site-footer
  cards/                vendor-card
  sections/             hero, category-rail, section-heading
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
- [ ] **C1** Landing Website (hero done; add how-it-works, app CTA, testimonials, blog teaser)
- [ ] **C2** Authentication UI (mock) — routes `/login` `/register` referenced, not built
- [ ] **C3** Customer App
- [x] **C4** Restaurant Directory (`/restaurants`) — URL-driven filters (type/sort/open/search), results grid, empty state, loading skeleton
- [x] **C5** Restaurant Details (`/restaurants/[slug]`) — cover hero, stats, sectioned menu + section nav, info/hours sidebar; `generateStaticParams` + `generateMetadata`, 404 on miss
- [x] **C6** Food data — `menus.ts` (menu sections) + `foods.ts` (~40 items) seeded and surfaced on the detail menu; `FoodItemCard` with popular/spicy/price/compare. Cart action stubbed (toast) pending C7
- [ ] **C7** Cart (Zustand store) — wire `AddToCartButton` to the store
- [ ] **C8** Checkout
- [ ] **C9** Order Tracking (simulated)
- [ ] **C10–C33** Dashboards, POS, QR menu, delivery, wallet, offers, reviews, AI assistant,
      notifications, CMS, analytics, settings, a11y/perf review
- [ ] **D / E** Backend architecture & implementation (after prototype is complete)

### Known stubs (expected at this stage)

`/restaurants` + `/restaurants/[slug]` are live. Remaining nav links (`/cafes`,
`/offers`, `/login`, `/search`, …) still resolve to the 404 page until their
phases are built. The menu "Add" button toasts instead of adding to a cart —
the Zustand cart store lands in C7. Review/order entities are deferred to their
phases; the *types* exist so services are ready.
