"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BadgeCheck, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/stores/auth";
import { useVerification } from "@/stores/verification";
import { demoVerificationCode } from "@/services/verification";
import { MAX_ATTEMPTS, challengeError } from "@/lib/verification";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/auth/otp-input";
import { cn } from "@/lib/utils";

/** Cadence for the resend countdown. */
const TICK_MS = 1000;

/**
 * VerifyAccountPanel — the verification step a registration now leaves undone
 * (Phase 17, G43).
 *
 * It exists because `register` no longer lies. An account is created unverified,
 * `User.isVerified` finally has two possible values, and this is the only route
 * between them: request a code, type it, and the session store records that
 * somebody proved the number is theirs.
 *
 * The prototype's code is the demo OTP the sign-in screen already advertises and
 * the panel says so out loud — a verification step that cannot be completed by a
 * reviewer is worse than none. It says so *only* while the mock is in charge
 * (`demoVerificationCode`), so the hint disappears the moment a real provider is
 * behind the seam rather than having to be remembered.
 */
export function VerifyAccountPanel({ className }: { className?: string }) {
  const t = useTranslations("verification");
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);

  const challenge = useVerification((s) => s.challenge);
  const busy = useVerification((s) => s.busy);
  const request = useVerification((s) => s.request);
  const confirm = useVerification((s) => s.confirm);
  const resendIn = useVerification((s) => s.resendIn);

  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void useVerification.persist.rehydrate();
  }, []);

  // Only while there is a countdown to draw.
  useEffect(() => {
    if (!challenge) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [challenge]);

  if (!hydrated || !user) return null;
  if (user.isVerified) {
    return (
      <p
        className={cn(
          "inline-flex items-center gap-2 rounded-pill bg-fresh/10 px-3 py-1.5 text-sm font-semibold text-fresh-600",
          className,
        )}
      >
        <BadgeCheck className="size-4" aria-hidden />
        {t("verified")}
      </p>
    );
  }

  const destination = user.phone ?? "";
  const blocked = challenge ? challengeError(challenge, now) : null;
  const wait = challenge ? resendIn(now) : 0;
  const demoCode = demoVerificationCode();

  async function send() {
    const result = await request({ destination, channel: "sms" });
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    setCode("");
    toast.success(t("codeSent", { destination }));
  }

  async function submit() {
    const result = await confirm(code);
    if (result.error) {
      setCode("");
      toast.error(t(result.error));
      return;
    }
    toast.success(t("nowVerified"));
  }

  return (
    <section
      className={cn("rounded-panel border border-accent/40 bg-accent-50/40 p-5", className)}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-accent/15 text-accent-600">
          <ShieldAlert className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 text-ink">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-body">
            {destination ? t("hint", { destination }) : t("hintNoPhone")}
          </p>

          {!destination ? (
            <Button href="/account" variant="outline" size="sm" className="mt-3">
              {t("addPhone")}
            </Button>
          ) : !challenge || blocked ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={send} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {challenge ? t("sendAgain") : t("sendCode")}
              </Button>
              {blocked && <span className="text-sm font-medium text-danger">{t(blocked)}</span>}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <OtpInput
                value={code}
                onChange={setCode}
                disabled={busy}
                ariaLabel={t("codeLabel")}
              />
              {challenge.attempts > 0 && (
                <p className="text-xs font-medium text-danger">
                  {t("attemptsLeft", { count: MAX_ATTEMPTS - challenge.attempts })}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={submit} disabled={busy || code.length < 6}>
                  {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {t("verify")}
                </Button>
                <Button size="sm" variant="ghost" onClick={send} disabled={busy || wait > 0}>
                  {wait > 0 ? t("resendIn", { seconds: wait }) : t("sendAgain")}
                </Button>
              </div>
              {demoCode && <p className="text-xs text-muted">{t("demoHint", { code: demoCode })}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
