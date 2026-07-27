"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { setLocale } from "@/config/i18n/actions";
import { localeMeta, locales, type Locale } from "@/config/i18n/config";
import { cn } from "@/lib/utils";

/**
 * LocaleSwitcher — persists the chosen locale via a server action, then
 * refreshes so the request config re-runs (updating all strings + <html dir>).
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const active = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <label
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-pill px-2.5 text-sm text-ink transition-colors hover:bg-surface-muted",
        pending && "opacity-60",
        className,
      )}
    >
      <Globe className="size-4" aria-hidden />
      <span className="sr-only">Language</span>
      <select
        value={active}
        onChange={onChange}
        disabled={pending}
        className="cursor-pointer appearance-none bg-transparent py-2 pe-1 font-medium outline-none"
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {localeMeta[code].flag} {localeMeta[code].native}
          </option>
        ))}
      </select>
    </label>
  );
}
