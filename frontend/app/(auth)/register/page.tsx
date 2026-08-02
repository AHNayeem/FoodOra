import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/frontend/components/auth/auth-card";
import { RegisterForm } from "@/frontend/components/auth/register-form";

type SearchParams = Promise<{ next?: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signUpTitle"), description: t("signUpSubtitle") };
}

/** Registration (Phase C2). Mock account creation — no backend persistence. */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");
  const safeNext = next?.startsWith("/") ? next : "/";

  return (
    <AuthCard
      title={t("signUpTitle")}
      subtitle={t("signUpSubtitle")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            {t("signInInstead")}
          </Link>
        </>
      }
    >
      <RegisterForm next={safeNext} />
    </AuthCard>
  );
}
