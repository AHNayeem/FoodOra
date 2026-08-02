import type { Testimonial } from "@/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * Customer testimonials for the landing social-proof rail. Avatars come from
 * pravatar (allow-listed in next.config). Quotes are content, not UI strings —
 * same convention as vendor taglines.
 */
export const testimonials: Testimonial[] = [
  {
    id: "tst_amina",
    name: "Amina Rahman",
    role: "Foodie, Dhaka",
    avatar: "https://i.pravatar.cc/160?img=45",
    quote:
      "I order dinner for the whole family every week. Live tracking means the kids know exactly when the biryani lands at the door.",
    rating: 5,
    ...base,
  },
  {
    id: "tst_daniel",
    name: "Daniel Osei",
    role: "Remote worker",
    avatar: "https://i.pravatar.cc/160?img=12",
    quote:
      "The lunch deals near my office are unreal. Two taps, and a proper meal shows up before my next call starts.",
    rating: 5,
    ...base,
  },
  {
    id: "tst_leila",
    name: "Leila Haddad",
    role: "Home cook turned regular",
    avatar: "https://i.pravatar.cc/160?img=32",
    quote:
      "Discovering local home chefs changed how I eat. It feels like ordering from a friend who happens to cook beautifully.",
    rating: 5,
    ...base,
  },
  {
    id: "tst_marco",
    name: "Marco Bianchi",
    role: "Weekend host",
    avatar: "https://i.pravatar.cc/160?img=59",
    quote:
      "Catering for eight people used to be a headache. I scheduled everything the night before and it arrived hot, on time.",
    rating: 4,
    ...base,
  },
  {
    id: "tst_sara",
    name: "Sara Kim",
    role: "Coffee enthusiast",
    avatar: "https://i.pravatar.cc/160?img=47",
    quote:
      "My morning flat white is a saved favourite now. Reorder in one tap, pay with the wallet, done before I leave home.",
    rating: 5,
    ...base,
  },
  {
    id: "tst_omar",
    name: "Omar Farooq",
    role: "Late-night student",
    avatar: "https://i.pravatar.cc/160?img=14",
    quote:
      "Half the places near campus are open past midnight here. The filters actually work — open now means open now.",
    rating: 5,
    ...base,
  },
];

export const testimonialById = new Map(testimonials.map((t) => [t.id, t]));
