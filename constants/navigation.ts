/**
 * navigation.ts — primary nav model. `labelKey` points at a next-intl message
 * so labels stay translatable; hrefs are the marketing routes.
 */
export interface NavItem {
  labelKey: string;
  href: string;
}

export const primaryNav: NavItem[] = [
  { labelKey: "nav.restaurants", href: "/restaurants" },
  { labelKey: "nav.cafes", href: "/cafes" },
  { labelKey: "nav.homeChefs", href: "/home-chefs" },
  { labelKey: "nav.cloudKitchens", href: "/cloud-kitchens" },
  { labelKey: "nav.catering", href: "/catering" },
  { labelKey: "nav.offers", href: "/offers" },
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
