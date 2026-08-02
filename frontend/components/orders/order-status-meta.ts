import {
  BadgeCheck,
  Ban,
  Bike,
  CheckCheck,
  CookingPot,
  DoorOpen,
  Navigation,
  PackageCheck,
  PackageX,
  PartyPopper,
  ReceiptText,
  ShoppingBag,
  Undo2,
  UserRoundCheck,
  XCircle,
  Wallet,
} from "lucide-react";
import type { OrderActor, OrderStatus } from "@/frontend/types";

/**
 * order-status-meta.ts — one icon and one tone per lifecycle state.
 *
 * Extracted because four surfaces render the same status and three of them had
 * grown their own map: the customer's timeline, the vendor's badge and the
 * rider's chip could disagree about whether `ready` was green or amber. A single
 * exhaustive `Record<OrderStatus, …>` also means adding a state to the machine
 * fails the build here until it has been given a look, which is the point.
 */

export type StatusTone = "neutral" | "primary" | "accent" | "fresh" | "danger";

export const STATUS_ICON: Record<OrderStatus, typeof Bike> = {
  placed: ReceiptText,
  confirmed: BadgeCheck,
  preparing: CookingPot,
  packing: PackageCheck,
  ready: ShoppingBag,
  "rider-assigned": UserRoundCheck,
  "picked-up": Bike,
  "on-the-way": Navigation,
  arrived: DoorOpen,
  delivered: PartyPopper,
  completed: CheckCheck,
  rejected: Ban,
  cancelled: XCircle,
  "delivery-failed": PackageX,
  returned: Undo2,
  refunded: Wallet,
};

export const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  placed: "accent",
  confirmed: "primary",
  preparing: "accent",
  packing: "accent",
  ready: "fresh",
  "rider-assigned": "primary",
  "picked-up": "primary",
  "on-the-way": "primary",
  arrived: "accent",
  delivered: "fresh",
  completed: "fresh",
  rejected: "danger",
  cancelled: "danger",
  "delivery-failed": "danger",
  returned: "danger",
  refunded: "neutral",
};

/** Background/text classes for a chip, keyed by tone. */
export const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-surface-muted text-body",
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent-50 text-accent-600",
  fresh: "bg-fresh-50 text-fresh-600",
  danger: "bg-danger/10 text-danger",
};

/** Solid fill for the "you are here" marker on the timeline. */
export const TONE_SOLID: Record<StatusTone, string> = {
  neutral: "bg-surface-muted text-body",
  primary: "bg-primary text-white",
  accent: "bg-accent text-white",
  fresh: "bg-fresh text-white",
  danger: "bg-danger text-white",
};

/** i18n key under `order.actor.*` — who the timeline attributes a step to. */
export const ACTOR_KEY: Record<OrderActor, string> = {
  customer: "customer",
  restaurant: "restaurant",
  rider: "rider",
  system: "system",
  admin: "admin",
};
