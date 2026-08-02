"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Laptop, Moon, Palette, Sun } from "lucide-react";
import { setLocale } from "@/frontend/config/i18n/actions";
import { localeMeta, locales, type Locale } from "@/frontend/config/i18n/config";
import { currencies, type CurrencyCode } from "@/frontend/config/regions";
import { useAuth } from "@/frontend/stores/auth";
import { updateProfile } from "@/frontend/services/account";
import {
  applyThemePreference,
  readThemePreference,
  subscribeToThemePreference,
  type ThemePreference,
} from "@/frontend/lib/theme-preference";
import { SettingsSection } from "./settings-primitives";
import { Field } from "@/frontend/components/ui/field";
import { cn } from "@/frontend/lib/utils";
import { toast } from "sonner";

const THEME_OPTIONS: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: "system", icon: Laptop },
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
];

const selectClass =
  "h-11 w-full rounded-field border border-line bg-surface px-3.5 text-sm text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30";

/**
 * AppearanceCard — theme, language and currency (Phase C28).
 *
 * None of these are stored in the settings object: the theme belongs to
 * `lib/theme-preference`, the language to the locale cookie, and the currency to
 * the user record. This card drives those owners so there is never a second copy
 * to fall out of step — which is also why the theme is read through
 * `useSyncExternalStore` (localStorage can change from the header toggle or
 * another tab) instead of being copied into local state.
 */
export function AppearanceCard() {
  const t = useTranslations("settings");
  const router = useRouter();
  const activeLocale = useLocale() as Locale;
  const user = useAuth((s) => s.user);
  const updateUser = useAuth((s) => s.updateUser);
  const [pending, startTransition] = useTransition();

  const preference = useSyncExternalStore(
    subscribeToThemePreference,
    readThemePreference,
    () => "system" as ThemePreference,
  );

  function onLocaleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    startTransition(async () => {
      await setLocale(next);
      // Persist on the profile too, so a future server session can restore it.
      if (user) {
        const res = await updateProfile(user, {
          name: user.name,
          phone: user.phone,
          avatar: user.avatar,
          locale: next,
          currency: user.currency,
        });
        if (res.data) updateUser({ locale: next });
      }
      router.refresh();
    });
  }

  function onCurrencyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (!user) return;
    const next = e.target.value;
    updateProfile(user, {
      name: user.name,
      phone: user.phone,
      avatar: user.avatar,
      locale: user.locale,
      currency: next,
    }).then((res) => {
      if (res.error) {
        toast.error(t("saveError"));
        return;
      }
      updateUser({ currency: next });
      toast.success(t("saved"));
    });
  }

  return (
    <SettingsSection
      icon={<Palette className="size-4.5" aria-hidden />}
      title={t("appearanceTitle")}
      description={t("appearanceDescription")}
    >
      <fieldset>
        <legend className="mb-2.5 text-sm font-semibold text-ink">{t("theme")}</legend>
        <div className="grid grid-cols-3 gap-2.5">
          {THEME_OPTIONS.map(({ value, icon: Icon }) => {
            const active = preference === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1.5 rounded-field border p-3 text-center text-sm font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-line text-body hover:bg-surface-muted hover:text-ink",
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={active}
                  onChange={() => applyThemePreference(value)}
                  className="sr-only"
                />
                <Icon className="size-5" aria-hidden />
                {t(`themeOption.${value}`)}
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">{t("themeHint")}</p>
      </fieldset>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field id="settings-language" label={t("language")}>
          {({ id }) => (
            <select
              id={id}
              value={activeLocale}
              onChange={onLocaleChange}
              disabled={pending}
              className={cn(selectClass, pending && "opacity-60")}
            >
              {locales.map((code) => (
                <option key={code} value={code}>
                  {localeMeta[code].flag} {localeMeta[code].native}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id="settings-currency" label={t("currency")}>
          {({ id }) => (
            <select
              id={id}
              value={user?.currency ?? "BDT"}
              onChange={onCurrencyChange}
              className={selectClass}
            >
              {(Object.keys(currencies) as CurrencyCode[]).map((code) => (
                <option key={code} value={code}>
                  {currencies[code].symbol} {code}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
    </SettingsSection>
  );
}
