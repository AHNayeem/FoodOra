"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BellRing, ShieldOff, Smartphone } from "lucide-react";
import { pushPermission, requestPush, type PushPermission } from "@/lib/push";
import { useNotifications } from "@/stores/notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * PushCard — turning on real browser notifications (Phase C25).
 *
 * Two switches have to agree and the card says so rather than hiding it: the
 * browser's permission, which we ask for from this button and cannot revoke,
 * and this device's opt-in, which is ours. Granting the browser permission and
 * then switching the app's toggle off is a real thing people do, and it works.
 *
 * Rendered only where supported — a button that cannot work is worse than no
 * button (the C24 voice-search rule). Permission is read through
 * `useSyncExternalStore` rather than an effect because it is exactly what that
 * hook is for: a value owned by the browser, with a server snapshot that keeps
 * SSR and hydration in agreement. The browser never notifies us when permission
 * changes, so the subscription is a no-op and the one moment it *can* change —
 * our own request — is folded in as an override.
 */
const NO_SUBSCRIPTION = () => () => {};
const SERVER_SNAPSHOT = (): PushPermission => "unsupported";

export function PushCard({ className }: { className?: string }) {
  const t = useTranslations("notifications");

  const detected = useSyncExternalStore(
    NO_SUBSCRIPTION,
    pushPermission,
    SERVER_SNAPSHOT,
  );
  const [granted, setGranted] = useState<PushPermission | null>(null);
  const permission = granted ?? detected;

  const [busy, setBusy] = useState(false);
  const optIn = useNotifications((s) => s.pushOptIn);
  const hydrated = useNotifications((s) => s.hydrated);
  const setOptIn = useNotifications((s) => s.setPushOptIn);

  // Nothing to offer where it cannot work — including on the server.
  if (permission === "unsupported") return null;

  const on = hydrated && optIn && permission === "granted";

  async function enable() {
    setBusy(true);
    const next = await requestPush();
    setBusy(false);
    setGranted(next);
    if (next === "granted") {
      setOptIn(true);
      toast.success(t("pushEnabled"));
      return;
    }
    if (next === "denied") toast.error(t("pushDenied"));
  }

  return (
    <section
      className={cn(
        "flex flex-wrap items-start gap-4 rounded-panel border border-line bg-surface p-5",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-pill",
          on ? "bg-fresh-50 text-fresh-600" : "bg-surface-muted text-muted",
        )}
      >
        {permission === "denied" ? (
          <ShieldOff className="size-5" aria-hidden />
        ) : on ? (
          <BellRing className="size-5" aria-hidden />
        ) : (
          <Smartphone className="size-5" aria-hidden />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-ink">{t("pushTitle")}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {permission === "denied"
            ? t("pushBlocked")
            : on
              ? t("pushOn")
              : t("pushOff")}
        </p>
        {/* The half we do not have. Saying it here is cheaper than a support
            ticket asking why a closed tab went quiet. */}
        <p className="mt-2 text-xs text-muted">{t("pushLimit")}</p>
      </div>

      {permission === "granted" ? (
        <label className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => setOptIn(e.target.checked)}
            className="size-4 rounded border-line text-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          {t("pushToggle")}
        </label>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={busy || permission === "denied"}
          onClick={enable}
          className="shrink-0"
        >
          {t("pushEnable")}
        </Button>
      )}
    </section>
  );
}
