"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { changePassword, MIN_PASSWORD_LENGTH } from "@/frontend/services/settings";
import { SettingsSection } from "./settings-primitives";
import { Field } from "@/frontend/components/ui/field";
import { Input } from "@/frontend/components/ui/input";
import { Button } from "@/frontend/components/ui/button";

const EMPTY = { current: "", next: "", confirm: "" };

/**
 * PasswordCard — change password (Phase C28). The service owns validation and
 * returns i18n keys, so the same rules apply whether they're checked here or by
 * the Phase E backend; this only decides where to show the message.
 */
export function PasswordCard() {
  const t = useTranslations("settings");
  const [form, setForm] = useState(EMPTY);
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const filled = form.current !== "" && form.next !== "" && form.confirm !== "";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    changePassword(form).then((res) => {
      setSaving(false);
      if (res.error) {
        toast.error(t(res.error));
        return;
      }
      setForm(EMPTY);
      toast.success(t("passwordChanged"));
    });
  }

  return (
    <SettingsSection
      icon={<KeyRound className="size-4.5" aria-hidden />}
      title={t("passwordTitle")}
      description={t("passwordDescription")}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field id="settings-current-password" label={t("currentPassword")}>
          {({ id }) => (
            <Input
              id={id}
              type={reveal ? "text" : "password"}
              value={form.current}
              onChange={set("current")}
              autoComplete="current-password"
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="settings-new-password"
            label={t("newPassword")}
            hint={t("passwordRule", { min: MIN_PASSWORD_LENGTH })}
          >
            {({ id }) => (
              <Input
                id={id}
                type={reveal ? "text" : "password"}
                value={form.next}
                onChange={set("next")}
                autoComplete="new-password"
              />
            )}
          </Field>
          <Field id="settings-confirm-password" label={t("confirmPassword")}>
            {({ id }) => (
              <Input
                id={id}
                type={reveal ? "text" : "password"}
                value={form.confirm}
                onChange={set("confirm")}
                autoComplete="new-password"
              />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!filled || saving}>
            {saving ? t("updating") : t("updatePassword")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setReveal((r) => !r)}>
            {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            {reveal ? t("hidePasswords") : t("showPasswords")}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
