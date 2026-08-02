"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { Loader2, MailCheck } from "lucide-react";
import { requestPasswordReset } from "@/frontend/services/auth";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Field } from "@/frontend/components/ui/field";

const schema = z.object({
  email: z.string().min(1, "errors.emailRequired").email("errors.emailInvalid"),
});
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    const res = await requestPasswordReset(values.email);
    if (res.data) setSentTo(res.data.email);
  }

  if (sentTo) {
    return (
      <div className="rounded-panel border border-line bg-surface p-6 text-center">
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-pill bg-fresh/10 text-fresh">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h2 className="mt-4 text-h3 text-ink">{t("checkYourInbox")}</h2>
        <p className="mt-2 text-sm text-body">{t("resetSent", { email: sentTo })}</p>
        <Button href="/login" variant="outline" size="md" className="mt-5 w-full">
          {t("backToSignIn")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field id="email" label={t("email")} error={errors.email && t(errors.email.message!)}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={describedBy}
            {...register("email")}
          />
        )}
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        {t("sendResetLink")}
      </Button>
      <p className="text-center text-sm text-body">
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {t("backToSignIn")}
        </Link>
      </p>
    </form>
  );
}
