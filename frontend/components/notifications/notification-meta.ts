import {
  Bell,
  Bike,
  CalendarCheck,
  ChefHat,
  Mail,
  Megaphone,
  MessageSquare,
  ReceiptText,
  RepeatIcon,
  Smartphone,
  Star,
  Tag,
  Wallet,
} from "lucide-react";
import type { DeliveryChannel, NotifyCategory, NotifyTone } from "@/frontend/types";

/**
 * notification-meta.ts — one icon per category and one accent per tone.
 *
 * The same reasoning as `order-status-meta`: four surfaces draw a notification
 * (the bell, the account centre, the delivery log, the admin campaign list) and
 * each growing its own map is how they come to disagree. Exhaustive `Record`s,
 * so adding a category fails the build here until someone has given it a look.
 */

export const CATEGORY_ICON: Record<NotifyCategory, typeof Bell> = {
  order: ReceiptText,
  delivery: Bike,
  payment: Wallet,
  review: Star,
  reservation: CalendarCheck,
  subscription: RepeatIcon,
  catering: ChefHat,
  promo: Tag,
  system: Megaphone,
};

/** Tab order in the notification centre — most-used first, not alphabetical. */
export const CATEGORY_ORDER: readonly NotifyCategory[] = [
  "order",
  "delivery",
  "payment",
  "review",
  "reservation",
  "subscription",
  "catering",
  "promo",
  "system",
];

/** Accent for the icon chip and the row's unread wash. */
export const TONE_CLASS: Record<NotifyTone, string> = {
  info: "bg-primary/10 text-primary",
  success: "bg-fresh-50 text-fresh-600",
  warning: "bg-accent-50 text-accent-600",
  danger: "bg-danger/10 text-danger",
};

export const CHANNEL_ICON: Record<DeliveryChannel, typeof Bell> = {
  push: Smartphone,
  email: Mail,
  sms: MessageSquare,
};

/** Delivery-log status colours. Suppressed is muted, not red: it worked. */
export const DISPATCH_CLASS: Record<"sent" | "suppressed" | "failed", string> = {
  sent: "bg-fresh-50 text-fresh-600",
  suppressed: "bg-surface-muted text-muted",
  failed: "bg-danger/10 text-danger",
};
