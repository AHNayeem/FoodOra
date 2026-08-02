import { useTranslations } from "next-intl";
import type { OrderStatus } from "@/frontend/types";
import { cn } from "@/frontend/lib/utils";
import { STATUS_ICON, STATUS_TONE, TONE_CLASS } from "./order-status-meta";

/**
 * OrderStatusChip — the one pill that renders a lifecycle state, used by every
 * surface. Labels come from the shared `order.status.*` messages, so the
 * customer, the kitchen, the rider and admin always call a state the same thing.
 *
 * `live` adds a pulse for a state something is actively happening in, which is
 * how a board of twenty rows tells you at a glance which three need attention.
 */
export function OrderStatusChip({
  status,
  live = false,
  size = "md",
  className,
}: {
  status: OrderStatus;
  live?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = useTranslations("order");
  const Icon = STATUS_ICON[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONE_CLASS[STATUS_TONE[status]],
        className,
      )}
    >
      {live ? (
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      ) : (
        <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden />
      )}
      {t(`status.${status}`)}
    </span>
  );
}
