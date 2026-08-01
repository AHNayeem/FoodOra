import {
  BadgeCheck,
  Bike,
  CalendarClock,
  ChefHat,
  Clock,
  Coffee,
  CreditCard,
  Flame,
  Gift,
  HandCoins,
  Headphones,
  Leaf,
  type LucideIcon,
  type LucideProps,
  MapPin,
  Percent,
  Salad,
  ShieldCheck,
  Sparkles,
  Store,
  Timer,
  TrendingUp,
  Utensils,
  Wallet,
} from "lucide-react";

/**
 * The icons marketing content may reference by name. Content (mock today, a CMS
 * later) stores a string; keeping an explicit allow-list means an unknown or
 * malicious name can never become an arbitrary component, and the bundle only
 * carries icons that are actually reachable.
 */
const ICONS: Record<string, LucideIcon> = {
  BadgeCheck,
  Bike,
  CalendarClock,
  ChefHat,
  Clock,
  Coffee,
  CreditCard,
  Flame,
  Gift,
  HandCoins,
  Headphones,
  Leaf,
  MapPin,
  Percent,
  Salad,
  ShieldCheck,
  Sparkles,
  Store,
  Timer,
  TrendingUp,
  Utensils,
  Wallet,
};

/**
 * DashIcon — renders a Lucide icon named by content. Falls back to `Sparkles`
 * so an unrecognised name degrades to a neutral glyph rather than a crash.
 */
export function DashIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon aria-hidden {...props} />;
}
