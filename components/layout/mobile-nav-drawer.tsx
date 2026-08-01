"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronRight, LogOut, User as UserIcon, X } from "lucide-react";
import type { User } from "@/types";
import { navGroups, primaryNav } from "@/constants/navigation";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/ui/locale-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { isNavActive } from "@/components/layout/primary-nav";
import { useAuth } from "@/stores/auth";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * MobileNavDrawer — the slide-over that replaces the desktop bar below `lg`.
 *
 * The old mobile menu was a max-height accordion pinned under the header: it
 * pushed the page down, capped out at 24rem (so the list clipped), and had
 * nowhere to put the account. This is a real dialog — scroll-locked, Escape to
 * close, focus trapped and restored — with the profile at the top, the
 * categories in between and locale/theme/sign-out at the bottom.
 */
export function MobileNavDrawer({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const signOut = useAuth((s) => s.signOut);

  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const restoreFocusTo = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      restoreFocusTo?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const initials = user
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  function handleSignOut() {
    signOut();
    onClose();
    toast.success(t("account.signedOut"));
    router.push("/");
  }

  return (
    <div className="fixed inset-0 z-[70] lg:hidden">
      <div
        className="animate-fade-in absolute inset-0 bg-ink/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("common.menu")}
        className="animate-drawer-in absolute inset-y-0 end-0 flex w-[88%] max-w-sm flex-col bg-surface shadow-menu"
      >
        {/* Who you are — the drawer's first answer, signed in or not. */}
        <header className="flex items-start gap-3 border-b border-line bg-surface-alt px-4 py-4">
          {user ? (
            <Link
              href="/account"
              onClick={onClose}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-card p-1 transition-colors hover:bg-surface-muted"
            >
              <span className="inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-primary text-sm font-bold text-white">
                {user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar} alt="" className="size-full object-cover" />
                ) : (
                  initials
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-ink">{user.name}</span>
                <span className="block truncate text-xs text-muted">{user.email}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />
            </Link>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3 p-1">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-muted">
                <UserIcon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-ink">{t("account.role.guest")}</span>
                <span className="block truncate text-xs text-muted">{t("auth.signInSubtitle")}</span>
              </span>
            </div>
          )}

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="-me-1 inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink transition-colors hover:bg-surface-muted"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <nav aria-label={t("nav.primary")} className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.id} className="mb-4 last:mb-0">
              <h2 className="px-3 pb-1.5 text-[11px] font-bold tracking-wider text-muted uppercase">
                {t(group.labelKey)}
              </h2>
              <ul className="space-y-0.5">
                {primaryNav
                  .filter((item) => item.group === group.id)
                  .map((item) => {
                    const active = isNavActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-12 items-center gap-3 rounded-card px-3 py-2 font-medium transition-colors",
                            active
                              ? "bg-primary/10 text-primary"
                              : "text-body hover:bg-surface-muted hover:text-ink",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex size-9 shrink-0 items-center justify-center rounded-pill",
                              active ? "bg-primary text-white" : "bg-surface-muted text-muted",
                            )}
                          >
                            <Icon className="size-4.5" aria-hidden />
                          </span>
                          {t(item.labelKey)}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>

        <footer className="space-y-3 border-t border-line bg-surface-alt px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <LocaleSwitcher className="h-11 border border-line bg-surface" />
            <ThemeToggle className="size-11 border border-line bg-surface" />
          </div>

          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-pill border border-line bg-surface font-semibold text-danger transition-colors hover:bg-danger/5"
            >
              <LogOut className="size-4 rtl:rotate-180" aria-hidden />
              {t("account.signOut")}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Button href="/login" variant="outline" onClick={onClose} className="flex-1">
                {t("common.signIn")}
              </Button>
              <Button href="/register" onClick={onClose} className="flex-1">
                {t("common.getStarted")}
              </Button>
            </div>
          )}
        </footer>
      </aside>
    </div>
  );
}
