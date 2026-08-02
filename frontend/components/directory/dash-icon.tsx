import {
  BadgeCheck,
  Bike,
  Briefcase,
  CalendarCheck,
  CalendarClock,
  ChefHat,
  Clock,
  Coffee,
  CookingPot,
  CreditCard,
  FileText,
  Flame,
  Gift,
  HandCoins,
  Headphones,
  Leaf,
  type LucideIcon,
  type LucideProps,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Newspaper,
  PartyPopper,
  Percent,
  Phone,
  Salad,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Timer,
  TrendingUp,
  Users,
  Utensils,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";

/**
 * The icons content may reference by name. Content (the CMS since C26, the mock
 * before it) stores a string; keeping an explicit allow-list means an unknown or
 * malicious name can never become an arbitrary component, and the bundle only
 * carries icons that are actually reachable.
 *
 * It is also the vocabulary the CMS's icon field offers, so an editor cannot pick
 * a glyph the site would fail to draw.
 */
const ICONS: Record<string, LucideIcon> = {
  BadgeCheck,
  Bike,
  Briefcase,
  CalendarCheck,
  CalendarClock,
  ChefHat,
  Clock,
  Coffee,
  CookingPot,
  CreditCard,
  FileText,
  Flame,
  Gift,
  HandCoins,
  Headphones,
  Leaf,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Newspaper,
  PartyPopper,
  Percent,
  Phone,
  Salad,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Timer,
  TrendingUp,
  Users,
  Utensils,
  UtensilsCrossed,
  Wallet,
};

/** Every name the CMS's icon field offers, in the order it offers them. */
export const iconNames = Object.keys(ICONS);

/**
 * DashIcon — renders a Lucide icon named by content. Falls back to `Sparkles`
 * so an unrecognised name degrades to a neutral glyph rather than a crash.
 */
export function DashIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon aria-hidden {...props} />;
}
