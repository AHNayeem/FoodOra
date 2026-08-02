"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { socialLogin, type SocialProvider } from "@/frontend/services/auth";
import { useAuth } from "@/frontend/stores/auth";
import { cn } from "@/frontend/lib/utils";

/** Brand marks — lucide has no logos, so these are minimal inline SVGs. */
function ProviderIcon({ provider }: { provider: SocialProvider }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1C6.2 6.9 8.9 4.8 12 4.8Z" />
      </svg>
    );
  }
  if (provider === "apple") {
    return (
      <svg viewBox="0 0 24 24" className="size-5 fill-ink" aria-hidden>
        <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.9-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.8Zm-2.3-7c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2-.5 2.7-1.3Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7v-3.5h3.1V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9v2.2h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z" />
    </svg>
  );
}

const PROVIDERS: SocialProvider[] = ["google", "apple", "facebook"];

/** Social sign-in row. Mocked: resolves to the demo customer, then redirects. */
export function SocialButtons({ next = "/" }: { next?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const signIn = useAuth((s) => s.signIn);
  const [pending, setPending] = useState<SocialProvider | null>(null);

  async function handle(provider: SocialProvider) {
    if (pending) return;
    setPending(provider);
    const res = await socialLogin(provider);
    if (res.error || !res.data) {
      toast.error(t("errors.generic"));
      setPending(null);
      return;
    }
    signIn(res.data);
    toast.success(t("signedInAs", { name: res.data.name }));
    router.push(next);
  }

  return (
    <div className="grid gap-2.5">
      {PROVIDERS.map((provider) => (
        <button
          key={provider}
          type="button"
          onClick={() => handle(provider)}
          disabled={pending !== null}
          className={cn(
            "inline-flex h-11 items-center justify-center gap-2.5 rounded-field border border-line bg-surface px-4 text-sm font-semibold text-ink",
            "transition-colors hover:bg-surface-muted disabled:opacity-60",
          )}
        >
          <ProviderIcon provider={provider} />
          {t("continueWith", { provider: t(`providers.${provider}`) })}
        </button>
      ))}
    </div>
  );
}
