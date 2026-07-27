/**
 * site.ts — global site config. Static brand/SEO metadata that the CMS will
 * eventually own (spec: everything editable). Kept here as the single source
 * for the prototype.
 */
export const siteConfig = {
  name: "FoodOra",
  tagline: "The complete digital ecosystem for food",
  description:
    "Discover restaurants, cafes, cloud kitchens, home chefs and catering. Order food, book tables, plan events — all in one global platform.",
  url: "https://foodora.example.com",
  locale: "en_US",
  social: {
    twitter: "https://twitter.com/foodora",
    instagram: "https://instagram.com/foodora",
    facebook: "https://facebook.com/foodora",
  },
} as const;
