import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/frontend/components/auth/auth-card";
import { LoginForm } from "@/frontend/components/auth/login-form";

type SearchParams = Promise<{ next?: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signInTitle"), description: t("signInSubtitle") };
}

/** Sign-in (Phase C2). `next` is resolved server-side and handed to the form. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");
  const safeNext = next?.startsWith("/") ? next : "/";

  return (
    <AuthCard
      title={t("signInTitle")}
      subtitle={t("signInSubtitle")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            {t("createOne")}
          </Link>
        </>
      }
    >
      <LoginForm next={safeNext} />
    </AuthCard>
  );
}
