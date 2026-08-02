import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UtensilsCrossed, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/frontend/components/ui/theme-toggle";
import { LocaleSwitcher } from "@/frontend/components/ui/locale-switcher";

/**
 * Auth group layout (Phase C2). A focused, chrome-free split screen: a branded
 * marketing panel on large screens and the form on the right. Deliberately does
 * NOT use the marketing header/footer — auth is a task, not a browse surface.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations();

  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-primary text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,176,32,.5), transparent 45%)",
          }}
          aria-hidden
        />
        <Link href="/" className="relative flex items-center gap-2 font-extrabold">
          <span className="inline-flex size-9 items-center justify-center rounded-pill bg-white/20">
            <UtensilsCrossed className="size-5" aria-hidden />
          </span>
          <span className="text-lg tracking-tight">{t("common.appName")}</span>
        </Link>
        <div className="relative max-w-md">
          <p className="text-3xl font-extrabold leading-tight">{t("auth.brandHeadline")}</p>
          <p className="mt-4 text-white/85">{t("auth.brandSub")}</p>
        </div>
        <p className="relative text-sm text-white/70">{t("common.tagline")}</p>
      </aside>

      {/* Form panel */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between px-5 py-4 md:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-body transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("auth.backToHome")}
          </Link>
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-5 py-8 md:px-8">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
