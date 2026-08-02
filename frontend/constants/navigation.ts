/**
 * navigation.ts — the *default* nav model. `labelKey` points at a next-intl
 * message so labels stay translatable; hrefs are the marketing routes.
 *
 * Since C26 this is also the seed the CMS's `header` / `footer` menu documents
 * are built from (`lib/mock/cms.ts`), and the header, drawer and footer render
 * the resolved menu rather than this array directly — so reordering a link,
 * hiding one or renaming it is an edit in `/admin/cms`, not a code change. It
 * stays here because navigation has to exist before any content loads, and
 * because it is what the seed derives from.
 *
 * `iconName` is a string rather than a component: content stores icons by name
 * (`components/directory/dash-icon` owns the allow-list), and a CMS-edited link
 * has no way to hand back a React component.
 *
 * `group` exists for the mobile drawer, which shows the same routes as a
 * categorised, tappable list — the desktop bar ignores it, so the two surfaces
 * can never drift apart on which routes exist.
 */

/** Drawer sections: places to order from, vs. things to book. */
export type NavGroup = "discover" | "services";

export interface NavItem {
  labelKey: string;
  href: string;
  /** Lucide icon name, resolved by `DashIcon`. */
  iconName: string;
  group: NavGroup;
}

export const primaryNav: NavItem[] = [
  { labelKey: "nav.restaurants", href: "/restaurants", iconName: "UtensilsCrossed", group: "discover" },
  { labelKey: "nav.cafes", href: "/cafes", iconName: "Coffee", group: "discover" },
  { labelKey: "nav.homeChefs", href: "/home-chefs", iconName: "ChefHat", group: "discover" },
  { labelKey: "nav.cloudKitchens", href: "/cloud-kitchens", iconName: "CookingPot", group: "discover" },
  { labelKey: "nav.mealPlans", href: "/meal-plans", iconName: "Salad", group: "services" },
  { labelKey: "nav.bookTable", href: "/reservations", iconName: "CalendarCheck", group: "services" },
  { labelKey: "nav.catering", href: "/catering", iconName: "PartyPopper", group: "services" },
  { labelKey: "nav.offers", href: "/offers", iconName: "Percent", group: "services" },
  { labelKey: "nav.assistant", href: "/ai", iconName: "Sparkles", group: "services" },
];

/** Section order + headings for the drawer. */
export const navGroups: { id: NavGroup; labelKey: string }[] = [
  { id: "discover", labelKey: "nav.discover" },
  { id: "services", labelKey: "nav.services" },
];

/** Footer columns — the three groups the CMS footer menu carries. */
export const footerNav = {
  company: [
    { labelKey: "footer.about", href: "/about" },
    { labelKey: "footer.careers", href: "/careers" },
    { labelKey: "footer.help", href: "/help" },
    { labelKey: "footer.contact", href: "/contact" },
  ],
  legal: [
    { labelKey: "footer.terms", href: "/terms" },
    { labelKey: "footer.privacy", href: "/privacy" },
    { labelKey: "footer.refund", href: "/refund" },
  ],
  business: [
    { labelKey: "nav.restaurants", href: "/partner" },
    { labelKey: "nav.becomeRider", href: "/rider" },
  ],
} as const;
