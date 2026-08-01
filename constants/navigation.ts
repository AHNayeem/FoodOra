/**
 * navigation.ts — primary nav model. `labelKey` points at a next-intl message
 * so labels stay translatable; hrefs are the marketing routes.
 *
 * `icon` and `group` exist for the mobile drawer, which shows the same routes
 * as a categorised, tappable list — the desktop bar ignores both, so the two
 * surfaces can never drift apart on which routes exist.
 */
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  ChefHat,
  Coffee,
  CookingPot,
  PartyPopper,
  Percent,
  Salad,
  UtensilsCrossed,
} from "lucide-react";

/** Drawer sections: places to order from, vs. things to book. */
export type NavGroup = "discover" | "services";

export interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  group: NavGroup;
}

export const primaryNav: NavItem[] = [
  { labelKey: "nav.restaurants", href: "/restaurants", icon: UtensilsCrossed, group: "discover" },
  { labelKey: "nav.cafes", href: "/cafes", icon: Coffee, group: "discover" },
  { labelKey: "nav.homeChefs", href: "/home-chefs", icon: ChefHat, group: "discover" },
  { labelKey: "nav.cloudKitchens", href: "/cloud-kitchens", icon: CookingPot, group: "discover" },
  { labelKey: "nav.mealPlans", href: "/meal-plans", icon: Salad, group: "services" },
  { labelKey: "nav.bookTable", href: "/reservations", icon: CalendarCheck, group: "services" },
  { labelKey: "nav.catering", href: "/catering", icon: PartyPopper, group: "services" },
  { labelKey: "nav.offers", href: "/offers", icon: Percent, group: "services" },
];

/** Section order + headings for the drawer. */
export const navGroups: { id: NavGroup; labelKey: string }[] = [
  { id: "discover", labelKey: "nav.discover" },
  { id: "services", labelKey: "nav.services" },
];

export const footerNav = {
  company: [
    { labelKey: "footer.about", href: "/about" },
    { labelKey: "footer.careers", href: "/careers" },
    { labelKey: "footer.help", href: "/help" },
  ],
  legal: [
    { labelKey: "footer.terms", href: "/terms" },
    { labelKey: "footer.privacy", href: "/privacy" },
  ],
} as const;
