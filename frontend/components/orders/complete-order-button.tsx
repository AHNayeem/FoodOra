"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import type { Order, OrderActor } from "@/types";
import { useOrders } from "@/stores/orders";
import { actorCan, canTransition } from "@/lib/order-machine";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * CompleteOrderButton — closing an order, from whichever surface is closing it.
 *
 * `delivered → completed` was legal in the machine from the start and offered by
 * nothing: with the demo autopilot switched off, every order in the prototype
 * stopped one step short of the end and its money was never worked out (G03).
 * This is the human actor that step was missing.
 *
 * Three surfaces need it — the customer's tracker, their order history, and the
 * admin's settle queue for an order nobody closes — so it lives once, here.
 * Whether to show it is asked of the machine (`canTransition` + `actorCan`)
 * rather than by testing the status, so the button cannot outlive a change to the
 * lifecycle graph.
 *
 * Completing is irreversible: `TRANSITIONS.completed` is empty, so there is no
 * way back and no way to do it twice. Hence the confirmation, and hence the
 * button disappearing the moment the status moves on.
 */
export function CompleteOrderButton({
  order,
  actor,
  size = "md",
  className,
}: {
  order: Order;
  /** Who is closing it — the machine records this on the event. */
  actor: Extract<OrderActor, "customer" | "admin">;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const t = useTranslations("order");
  const advance = useOrders((s) => s.advance);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!canTransition(order.status, "completed") || !actorCan(actor, "completed")) {
    return null;
  }

  function confirm() {
    setSubmitting(true);
    const result = advance(order.id, "completed", actor);
    setSubmitting(false);
    setOpen(false);
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    toast.success(t("completeSuccess"));
  }

  return (
    <>
      <Button size={size} className={className} onClick={() => setOpen(true)}>
        <CheckCircle2 className="size-4" aria-hidden />
        {t("completeOrder")}
      </Button>
      <ConfirmDialog
        open={open}
        title={t("completeConfirmTitle")}
        body={t("completeConfirmBody")}
        confirmLabel={t("completeConfirm")}
        cancelLabel={t("completeCancel")}
        submitting={submitting}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
      />
    </>
  );
}
