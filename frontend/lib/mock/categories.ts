import type { Category } from "@/frontend/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * Home-page browse categories ("What are you craving?"). `keywords` is what the
 * search service matches dishes and vendors against, so a category tile is a
 * real query rather than a decorative link.
 */
export const categories: Category[] = [
  { id: "cat_pizza", slug: "pizza", name: "Pizza", emoji: "🍕", sort: 1, keywords: ["pizza", "margherita", "pepperoni", "italian"], image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cat_burgers", slug: "burgers", name: "Burgers", emoji: "🍔", sort: 2, keywords: ["burger", "smash", "cheeseburger", "american"], image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cat_sushi", slug: "sushi", name: "Sushi", emoji: "🍣", sort: 3, keywords: ["sushi", "nigiri", "roll", "sashimi", "japanese"], image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cat_biryani", slug: "biryani", name: "Biryani", emoji: "🍛", sort: 4, keywords: ["biryani", "kacchi", "pulao", "indian", "bengali"], image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cat_pasta", slug: "pasta", name: "Pasta", emoji: "🍝", sort: 5, keywords: ["pasta", "carbonara", "lasagna", "italian"], image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cat_tacos", slug: "tacos", name: "Tacos", emoji: "🌮", sort: 6, keywords: ["taco", "burrito", "nachos", "mexican"], image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cat_coffee", slug: "coffee", name: "Coffee", emoji: "☕", sort: 7, keywords: ["coffee", "latte", "cappuccino", "espresso", "cold brew"], image: "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cat_desserts", slug: "desserts", name: "Desserts", emoji: "🍰", sort: 8, keywords: ["cake", "dessert", "brownie", "pastry", "croissant", "pitha"], image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cat_healthy", slug: "healthy", name: "Healthy", emoji: "🥗", sort: 9, keywords: ["bowl", "salad", "juice", "healthy", "vegan", "protein"], image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cat_ramen", slug: "ramen", name: "Ramen", emoji: "🍜", sort: 10, keywords: ["ramen", "noodle", "pad thai", "pho", "broth"], image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80", ...base },
];

export const categoryById = new Map(categories.map((c) => [c.id, c]));
export const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
