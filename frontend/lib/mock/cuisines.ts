import type { Cuisine } from "@/types";

/** Fixed seed timestamp so mock data is deterministic across renders. */
export const SEED_NOW = "2026-01-01T00:00:00.000Z";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * Cuisines — referenced by Vendor.cuisineIds. Keep ids stable; other seeds
 * (vendors) point at these `cus_*` ids as foreign keys would.
 */
export const cuisines: Cuisine[] = [
  { id: "cus_italian", slug: "italian", name: "Italian", emoji: "🍝", image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cus_american", slug: "american", name: "American", emoji: "🍔", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cus_japanese", slug: "japanese", name: "Japanese", emoji: "🍣", image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cus_indian", slug: "indian", name: "Indian", emoji: "🍛", image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cus_mexican", slug: "mexican", name: "Mexican", emoji: "🌮", image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cus_bengali", slug: "bengali", name: "Bengali", emoji: "🐟", image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cus_thai", slug: "thai", name: "Thai", emoji: "🍲", image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80", ...base },
  { id: "cus_desserts", slug: "desserts", name: "Desserts", emoji: "🍰", image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=600&q=80", ...base },
];

export const cuisineById = new Map(cuisines.map((c) => [c.id, c]));
export const cuisineBySlug = new Map(cuisines.map((c) => [c.slug, c]));
