"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  User as UserIcon,
  ShoppingBag,
  Heart,
  MapPin,
  Wallet,
  LayoutDashboard,
  Settings,
  LogOut,
} from "lucide-react";
import type { User } from "@/types";
import { useAuth } from "@/stores/auth";

/**
 * AccountMenu — the signed-in dropdown shown in the header once a session
 * exists. Links point at surfaces that land in later phases (orders, wallet,
 * dashboard…); sign-out is fully wired to the session store today.
 */
export function AccountMenu({ user }: { user: User }) {
  const t = useTranslations("account");
  const router = useRouter();
  const signOut = useAuth((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isStaff = user.role !== "customer" && user.role !== "guest";
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const items = [
    { href: "/account", label: t("profile"), icon: UserIcon },
    { href: "/account/orders", label: t("orders"), icon: ShoppingBag },
    { href: "/account/addresses", label: t("addresses"), icon: MapPin },
    { href: "/account/favorites", label: t("favorites"), icon: Heart },
    { href: "/account/wallet", label: t("wallet"), icon: Wallet },
    ...(isStaff
      ? [{ href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard }]
      : []),
    { href: "/account/settings", label: t("settings"), icon: Settings },
  ];

  function handleSignOut() {
    signOut();
    setOpen(false);
    toast.success(t("signedOut"));
    router.push("/");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("myAccount")}
        className="inline-flex items-center gap-2 rounded-pill border border-line py-1 ps-1 pe-2.5 transition-colors hover:bg-surface-muted"
      >
        <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-pill bg-primary text-xs font-bold text-white">
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt="" className="size-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <span className="hidden max-w-24 truncate text-sm font-semibold text-ink sm:block">
          {user.name.split(" ")[0]}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 mt-2 w-60 overflow-hidden rounded-panel border border-line bg-surface py-1.5 shadow-card"
        >
          <div className="border-b border-line px-4 py-2.5">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-body transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <Icon className="size-4 text-muted" aria-hidden />
              {label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 border-t border-line px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/5"
          >
            <LogOut className="size-4 rtl:rotate-180" aria-hidden />
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
