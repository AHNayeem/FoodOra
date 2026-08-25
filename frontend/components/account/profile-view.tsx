"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { locales, localeMeta } from "@/config/i18n/config";
import { currencies, type CurrencyCode } from "@/config/regions";
import { useAuth } from "@/stores/auth";
import { updateProfile, type ProfilePatch } from "@/services/account";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VerifyAccountPanel } from "@/components/auth/verify-account-panel";

const selectClass =
  "h-11 w-full rounded-field border border-line bg-surface px-3.5 text-sm text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30";

/**
 * ProfileView — the account landing page (Phase C3). Shows the signed-in
 * customer's identity and lets them edit their editable fields + locale /
 * currency preferences. Saving calls the simulated `updateProfile` service and
 * commits the result to the session store; email and role are read-only.
 */
export function ProfileView() {
  const t = useTranslations("account");
  const user = useAuth((s) => s.user);
  const updateUser = useAuth((s) => s.updateUser);

  const [form, setForm] = useState<ProfilePatch>(() => ({
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    avatar: user?.avatar ?? "",
    locale: user?.locale ?? "en",
    currency: user?.currency ?? "BDT",
  }));
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const set =
    (key: keyof ProfilePatch) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const dirty =
    form.name !== (user.name ?? "") ||
    form.phone !== (user.phone ?? "") ||
    form.avatar !== (user.avatar ?? "") ||
    form.locale !== user.locale ||
    form.currency !== user.currency;

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function reset() {
    if (!user) return;
    setForm({
      name: user.name,
      phone: user.phone ?? "",
      avatar: user.avatar,
      locale: user.locale,
      currency: user.currency,
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.name.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    setSaving(true);
    updateProfile(user, {
      ...form,
      name: form.name.trim(),
      phone: form.phone?.trim() ?? "",
    }).then((res) => {
      setSaving(false);
      if (res.error || !res.data) {
        toast.error(t("saveError"));
        return;
      }
      const { name, phone, avatar, locale, currency } = res.data;
      updateUser({ name, phone, avatar, locale, currency });
      toast.success(t("saved"));
    });
  }

  return (
    <div className="space-y-5">
      {/* An account nobody has proved belongs to them (Phase 17, G43). Renders
          the verified chip once they have, so the state is legible either way. */}
      <VerifyAccountPanel />

      <section className="rounded-panel border border-line bg-surface p-6">
      {/* Identity header */}
      <div className="flex items-center gap-4 border-b border-line pb-5">
        <span className="inline-flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-primary text-lg font-bold text-white">
          {form.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.avatar} alt="" className="size-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-h3 text-ink">{user.name}</h2>
          <p className="truncate text-sm text-muted">{user.email}</p>
          <span className="mt-1.5 inline-flex items-center rounded-pill bg-surface-muted px-2.5 py-0.5 text-xs font-semibold capitalize text-body">
            {t(`role.${user.role}`)}
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="profile-name" label={t("name")}>
            {({ id }) => (
              <Input id={id} value={form.name} onChange={set("name")} autoComplete="name" />
            )}
          </Field>
          <Field id="profile-email" label={t("email")}>
            {({ id }) => (
              <Input id={id} value={user.email} readOnly disabled autoComplete="email" />
            )}
          </Field>
          <Field id="profile-phone" label={t("phone")}>
            {({ id }) => (
              <Input
                id={id}
                type="tel"
                inputMode="tel"
                value={form.phone ?? ""}
                onChange={set("phone")}
                autoComplete="tel"
                placeholder="+8801XXXXXXXXX"
              />
            )}
          </Field>
          <Field id="profile-avatar" label={t("avatarUrl")}>
            {({ id }) => (
              <Input
                id={id}
                type="url"
                value={form.avatar}
                onChange={set("avatar")}
                placeholder="https://…"
              />
            )}
          </Field>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("preferences")}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="profile-locale" label={t("language")}>
              {({ id }) => (
                <select id={id} value={form.locale} onChange={set("locale")} className={selectClass}>
                  {locales.map((code) => (
                    <option key={code} value={code}>
                      {localeMeta[code].flag} {localeMeta[code].native}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field id="profile-currency" label={t("currency")}>
              {({ id }) => (
                <select id={id} value={form.currency} onChange={set("currency")} className={selectClass}>
                  {(Object.keys(currencies) as CurrencyCode[]).map((code) => (
                    <option key={code} value={code}>
                      {currencies[code].symbol} {code}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-line pt-5">
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? t("saving") : t("save")}
          </Button>
          <Button type="button" variant="ghost" onClick={reset} disabled={!dirty || saving}>
            {t("cancel")}
          </Button>
        </div>
      </form>
      </section>
    </div>
  );
}
