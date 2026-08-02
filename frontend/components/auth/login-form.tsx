"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Mail, KeyRound } from "lucide-react";
import { login, requestOtp, verifyOtp } from "@/services/auth";
import { DEMO_OTP, DEMO_PASSWORD } from "@/lib/mock";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { AuthDivider } from "@/components/auth/auth-card";
import { SocialButtons } from "@/components/auth/social-buttons";
import { OtpInput } from "@/components/auth/otp-input";
import { DEMO_LOGIN_EMAIL } from "./demo-accounts";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().min(1, "errors.emailRequired").email("errors.emailInvalid"),
  password: z.string().min(1, "errors.passwordRequired"),
});
type LoginValues = z.infer<typeof loginSchema>;

type Mode = "password" | "otp";

export function LoginForm({ next = "/" }: { next?: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const signIn = useAuth((s) => s.signIn);
  const [mode, setMode] = useState<Mode>("password");

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-pill bg-surface-muted p-1">
        {(["password", "otp"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-pill py-2 text-sm font-semibold transition-colors",
              mode === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {m === "password" ? <Mail className="size-4" /> : <KeyRound className="size-4" />}
            {t(m === "password" ? "tabPassword" : "tabOtp")}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <PasswordMode next={next} signIn={signIn} t={t} tc={tc} router={router} />
      ) : (
        <OtpMode next={next} signIn={signIn} t={t} tc={tc} router={router} />
      )}

      <AuthDivider label={t("orContinueWith")} />
      <SocialButtons next={next} />
    </div>
  );
}

type ModeProps = {
  next: string;
  signIn: (u: import("@/types").User) => void;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  router: ReturnType<typeof useRouter>;
};

function PasswordMode({ next, signIn, t, tc, router }: ModeProps) {
  const [showPw, setShowPw] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    const res = await login(values);
    if (res.error || !res.data) {
      toast.error(t(res.error ?? "errors.generic"));
      return;
    }
    signIn(res.data);
    toast.success(t("signedInAs", { name: res.data.name }));
    router.push(next);
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

      <Field
        id="password"
        label={t("password")}
        error={errors.password && t(errors.password.message!)}
      >
        {({ id, describedBy }) => (
          <div className="relative">
            <Input
              id={id}
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
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

      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-semibold text-primary hover:underline">
          {t("forgotPassword")}
        </Link>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        {tc("signIn")}
      </Button>

      <DemoHint
        onUse={() => {
          setValue("email", DEMO_LOGIN_EMAIL, { shouldValidate: true });
          setValue("password", DEMO_PASSWORD, { shouldValidate: true });
        }}
        label={t("useDemoAccount")}
        detail={`${DEMO_LOGIN_EMAIL} · ${DEMO_PASSWORD}`}
      />
    </form>
  );
}

function OtpMode({ next, signIn, t, router }: ModeProps) {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (phone.trim().length < 6) {
      toast.error(t("errors.phoneInvalid"));
      return;
    }
    setBusy(true);
    const res = await requestOtp(phone);
    setBusy(false);
    if (res.error) return toast.error(t("errors.generic"));
    setSent(true);
    toast.success(t("otpSent"));
  }

  async function verify() {
    setBusy(true);
    const res = await verifyOtp({ phone, code });
    setBusy(false);
    if (res.error || !res.data) {
      toast.error(t(res.error ?? "errors.generic"));
      return;
    }
    signIn(res.data);
    toast.success(t("signedInAs", { name: res.data.name }));
    router.push(next);
  }

  return (
    <div className="space-y-4">
      <Field id="phone" label={t("phone")} hint={sent ? undefined : t("phoneHint")}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+8801XXXXXXXXX"
            value={phone}
            disabled={sent}
            aria-describedby={describedBy}
            onChange={(e) => setPhone(e.target.value)}
          />
        )}
      </Field>

      {!sent ? (
        <Button type="button" size="lg" className="w-full" onClick={send} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("sendCode")}
        </Button>
      ) : (
        <>
          <div className="space-y-1.5">
            <span className="block text-sm font-semibold text-ink">{t("enterCode")}</span>
            <OtpInput value={code} onChange={setCode} ariaLabel={t("enterCode")} disabled={busy} />
            <p className="text-xs text-muted">{t("otpDemoHint", { code: DEMO_OTP })}</p>
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={verify}
            disabled={busy || code.length < 6}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("verifyAndSignIn")}
          </Button>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
            }}
            className="w-full text-center text-sm font-medium text-body hover:text-ink"
          >
            {t("changeNumber")}
          </button>
        </>
      )}
    </div>
  );
}

function DemoHint({
  onUse,
  label,
  detail,
}: {
  onUse: () => void;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onUse}
      className="flex w-full items-center justify-between gap-3 rounded-field border border-dashed border-line bg-surface-muted/60 px-3.5 py-2.5 text-start transition-colors hover:border-primary"
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink">{label}</span>
        <span className="block truncate text-xs text-muted">{detail}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-primary">→</span>
    </button>
  );
}
