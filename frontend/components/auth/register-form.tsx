"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bike, Eye, EyeOff, Loader2, User as UserIcon, Store } from "lucide-react";
import { register as registerAccount } from "@/services/auth";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { AuthDivider } from "@/components/auth/auth-card";
import { SocialButtons } from "@/components/auth/social-buttons";
import { cn } from "@/lib/utils";

const registerSchema = z.object({
  name: z.string().min(2, "errors.nameRequired"),
  email: z.string().min(1, "errors.emailRequired").email("errors.emailInvalid"),
  phone: z.string().min(6, "errors.phoneInvalid"),
  password: z.string().min(8, "errors.passwordShort"),
  terms: z.literal(true, { message: "errors.termsRequired" }),
});
type RegisterValues = z.infer<typeof registerSchema>;

/**
 * Phase 7: riders can register. The account is all this creates — being a rider
 * takes an approved application (`/rider/apply`), which is what the rider app
 * gates on.
 */
type Role = "customer" | "restaurant-owner" | "delivery-rider";

export function RegisterForm({ next = "/" }: { next?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const signIn = useAuth((s) => s.signIn);
  const [role, setRole] = useState<Role>("customer");
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterValues) {
    const res = await registerAccount({
      name: values.name,
      email: values.email,
      phone: values.phone,
      password: values.password,
      role,
    });
    if (res.error || !res.data) {
      toast.error(t(res.error ?? "errors.generic"));
      return;
    }
    signIn(res.data);
    toast.success(t("welcomeName", { name: res.data.name }));
    router.push(next);
  }

  const roles: Array<{ key: Role; icon: typeof UserIcon }> = [
    { key: "customer", icon: UserIcon },
    { key: "restaurant-owner", icon: Store },
    { key: "delivery-rider", icon: Bike },
  ];

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Role picker */}
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink">{t("iWantTo")}</span>
          <div className="grid grid-cols-3 gap-2">
            {roles.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setRole(key)}
                aria-pressed={role === key}
                className={cn(
                  "flex items-center gap-2.5 rounded-field border p-3 text-start transition-colors",
                  role === key
                    ? "border-primary bg-primary/5 text-ink"
                    : "border-line text-body hover:bg-surface-muted",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-field",
                    role === key ? "bg-primary text-white" : "bg-surface-muted text-muted",
                  )}
                >
                  <Icon className="size-4.5" />
                </span>
                <span className="text-sm font-semibold leading-tight">
                  {t(key === "customer" ? "roleCustomer" : "roleVendor")}
                </span>
              </button>
            ))}
          </div>
        </div>

        <Field id="name" label={t("fullName")} error={errors.name && t(errors.name.message!)}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              autoComplete="name"
              placeholder={t("fullNamePlaceholder")}
              aria-invalid={!!errors.name}
              aria-describedby={describedBy}
              {...register("name")}
            />
          )}
        </Field>

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

        <Field id="phone" label={t("phone")} error={errors.phone && t(errors.phone.message!)}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+8801XXXXXXXXX"
              aria-invalid={!!errors.phone}
              aria-describedby={describedBy}
              {...register("phone")}
            />
          )}
        </Field>

        <Field
          id="password"
          label={t("password")}
          error={errors.password && t(errors.password.message!)}
          hint={t("passwordHint")}
        >
          {({ id, describedBy }) => (
            <div className="relative">
              <Input
                id={id}
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                aria-invalid={!!errors.password}
                aria-describedby={describedBy}
                className="pe-11"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={t(showPw ? "hidePassword" : "showPassword")}
                className="absolute inset-y-0 end-0 inline-flex w-11 items-center justify-center text-muted hover:text-ink"
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>

        <div>
          <label className="flex items-start gap-2.5 text-sm text-body">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 rounded border-line text-primary accent-[var(--color-primary)]"
              aria-invalid={!!errors.terms}
              {...register("terms")}
            />
            <span>
              {t.rich("agreeToTerms", {
                terms: (chunks) => (
                  <Link href="/terms" className="font-semibold text-primary hover:underline">
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link href="/privacy" className="font-semibold text-primary hover:underline">
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          </label>
          {errors.terms && (
            <p className="mt-1 text-xs font-medium text-danger">{t(errors.terms.message!)}</p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {t("createAccount")}
        </Button>
      </form>

      <AuthDivider label={t("orSignUpWith")} />
      <SocialButtons next={next} />
    </div>
  );
}
