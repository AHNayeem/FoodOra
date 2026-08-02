import type { MenuSection } from "@/frontend/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

const s = (id: string, vendorId: string, name: string, sort: number): MenuSection => ({
  id,
  vendorId,
  name,
  sort,
  ...base,
});

/**
 * Menu sections — the ordered groupings within a vendor's menu. `foods.ts`
 * items reference these `sec_*` ids; both reference `ven_*` vendor ids. This is
 * the C6 data groundwork surfaced on the restaurant detail page (C5).
 */
export const menuSections: MenuSection[] = [
  // Bella Napoli
  s("sec_bella_starters", "ven_bella_napoli", "Starters", 1),
  s("sec_bella_pizzas", "ven_bella_napoli", "Wood-fired Pizzas", 2),
  s("sec_bella_pasta", "ven_bella_napoli", "Pasta", 3),

  // Burger Lab
  s("sec_burger_burgers", "ven_burger_lab", "Smash Burgers", 1),
  s("sec_burger_sides", "ven_burger_lab", "Sides", 2),
  s("sec_burger_shakes", "ven_burger_lab", "Shakes", 3),

  // Sakura Sushi
  s("sec_sakura_starters", "ven_sakura_sushi", "Starters", 1),
  s("sec_sakura_rolls", "ven_sakura_sushi", "Signature Rolls", 2),
  s("sec_sakura_nigiri", "ven_sakura_sushi", "Nigiri", 3),

  // Spice Route
  s("sec_spice_biryani", "ven_spice_route", "Biryani", 1),
  s("sec_spice_kebabs", "ven_spice_route", "Kebabs", 2),
  s("sec_spice_curries", "ven_spice_route", "Curries", 3),

  // El Taco Loco
  s("sec_taco_tacos", "ven_el_taco", "Street Tacos", 1),
  s("sec_taco_burritos", "ven_el_taco", "Burritos", 2),
  s("sec_taco_sides", "ven_el_taco", "Sides", 3),

  // The Daily Grind
  s("sec_grind_coffee", "ven_the_daily_grind", "Coffee", 1),
  s("sec_grind_brunch", "ven_the_daily_grind", "All-day Brunch", 2),
  s("sec_grind_bakery", "ven_the_daily_grind", "Bakery", 3),

  // Rehana's Kitchen
  s("sec_rehana_meals", "ven_rehanas_kitchen", "Home Meals", 1),
  s("sec_rehana_sides", "ven_rehanas_kitchen", "Sides & Sweets", 2),

  // Green Bowl
  s("sec_green_bowls", "ven_green_bowl", "Grain Bowls", 1),
  s("sec_green_juices", "ven_green_bowl", "Cold-pressed Juices", 2),

  // Bangkok House
  s("sec_bangkok_starters", "ven_bangkok_house", "Starters", 1),
  s("sec_bangkok_curries", "ven_bangkok_house", "Curries", 2),
  s("sec_bangkok_noodles", "ven_bangkok_house", "Noodles & Rice", 3),

  // Sugar & Spoon
  s("sec_sugar_cakes", "ven_sugar_spoon", "Cakes", 1),
  s("sec_sugar_pastries", "ven_sugar_spoon", "Pastries", 2),
  s("sec_sugar_drinks", "ven_sugar_spoon", "Drinks", 3),

  // Bean & Bloom
  s("sec_bloom_espresso", "ven_bean_and_bloom", "Espresso Bar", 1),
  s("sec_bloom_toasts", "ven_bean_and_bloom", "Toasts & Plates", 2),

  // The Reading Room
  s("sec_reading_filter", "ven_the_reading_room", "Filter & Pots", 1),
  s("sec_reading_toasties", "ven_the_reading_room", "Toasties", 2),

  // Matcha House
  s("sec_matcha_drinks", "ven_matcha_house", "Matcha Bar", 1),
  s("sec_matcha_sweets", "ven_matcha_house", "Wagashi", 2),

  // Cha Ghor
  s("sec_cha_tea", "ven_cha_ghor", "Cha", 1),
  s("sec_cha_snacks", "ven_cha_ghor", "Snacks", 2),

  // Wok This Way
  s("sec_wok_noodles", "ven_wok_this_way", "Wok Noodles", 1),
  s("sec_wok_sides", "ven_wok_this_way", "Small Plates", 2),

  // Naan Stop
  s("sec_naan_wraps", "ven_naan_stop", "Tandoor Wraps", 1),
  s("sec_naan_sides", "ven_naan_stop", "Sides", 2),

  // Pasta Pronto
  s("sec_pronto_pasta", "ven_pasta_pronto", "Fresh Pasta", 1),
  s("sec_pronto_extras", "ven_pasta_pronto", "Salads & Extras", 2),

  // Bowl & Broth
  s("sec_broth_ramen", "ven_bowl_and_broth", "Ramen", 1),
  s("sec_broth_sides", "ven_bowl_and_broth", "Sides", 2),

  // Nadia's Table
  s("sec_nadia_mezze", "ven_nadias_table", "Mezze", 1),
  s("sec_nadia_mains", "ven_nadias_table", "Mains", 2),

  // Mishtis by Ruma
  s("sec_ruma_sweets", "ven_mishtis_by_ruma", "Sweets", 1),

  // Chef Arif's Grill
  s("sec_arif_grill", "ven_chef_arifs_grill", "From the Charcoal", 1),

  // Tiffin by Shirin
  s("sec_shirin_tiffin", "ven_tiffin_by_shirin", "Daily Tiffin", 1),

  // Lola's Bakes
  s("sec_lola_cakes", "ven_lolas_bakes", "Cakes & Bakes", 1),
];

export const menuSectionById = new Map(menuSections.map((m) => [m.id, m]));
export const menuSectionsByVendor = menuSections.reduce<Record<string, MenuSection[]>>(
  (acc, m) => {
    (acc[m.vendorId] ??= []).push(m);
    return acc;
  },
  {},
);
