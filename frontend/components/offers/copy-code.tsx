"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/frontend/lib/utils";

/**
 * CopyCode — a promo code presented as a dashed voucher stub that copies to the
 * clipboard on click. Falls back to a toast-only confirmation when the Clipboard
 * API is unavailable (insecure origin, older browser), so the code is still
 * readable and the interaction never silently fails.
 */
export function CopyCode({ code, className }: { code: string; className?: string }) {
  const t = useTranslations("offers");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(t("codeCopied", { code }));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(t("codeCopyFailed", { code }));
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={t("copyCodeAria", { code })}
      className={cn(
        "inline-flex items-center gap-2 rounded-field border border-dashed border-primary bg-primary/5 px-3 py-2 font-mono text-sm font-bold tracking-wider text-primary transition-colors hover:bg-primary/10",
        className,
      )}
    >
      {code}
      {copied ? (
        <Check className="size-4 shrink-0" aria-hidden />
      ) : (
        <Copy className="size-4 shrink-0" aria-hidden />
      )}
    </button>
  );
}
