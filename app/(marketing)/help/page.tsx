import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { getHelpContent } from "@/services/pages";
import { FaqAccordion, PageHero } from "@/components/marketing/marketing-blocks";
import { DashIcon } from "@/components/directory/dash-icon";
import { SectionHeading } from "@/components/sections/section-heading";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/help" },
  };
}

/**
 * Help centre (spec: CMS — FAQs, Contact). Contact channels first, because
 * someone with a live order should not have to scroll past an FAQ to reach
 * support, then the grouped questions with an anchor list to jump between them.
 */
export default async function HelpPage() {
  const [content, t] = await Promise.all([getHelpContent(), getTranslations("help")]);

  return (
    <div className="pb-16">
      <PageHero eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />

      {/* Contact channels */}
      <section className="container-site py-14">
        <SectionHeading title={t("channelsTitle")} subtitle={t("channelsSubtitle")} />
        <ul className="grid gap-6 sm:grid-cols-2">
          {content.channels.map((channel) => {
            const external = !channel.href.startsWith("/");
            return (
              <li
                key={channel.title}
                className="flex flex-col rounded-panel border border-line bg-surface p-6"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-pill bg-primary/10 text-primary">
                  <DashIcon name={channel.icon} className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-ink">{channel.title}</h3>
                <p className="mt-2 flex-1 text-body">{channel.description}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  {channel.availability}
                </p>
                {external ? (
                  <a
                    href={channel.href}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    {channel.actionLabel}
                    <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
                  </a>
                ) : (
                  <Link
                    href={channel.href}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    {channel.actionLabel}
                    <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* FAQs */}
      <section className="border-t border-line bg-surface-muted py-14">
        <div className="container-site">
          <SectionHeading title={t("faqTitle")} subtitle={t("faqSubtitle")} />

          {/* Jump links */}
          <nav aria-label={t("faqTopics")} className="mb-10 flex flex-wrap gap-2">
            {content.faqs.map((group) => (
              <a
                key={group.id}
                href={`#${group.id}`}
                className="inline-flex h-10 items-center gap-1.5 rounded-pill border border-line bg-surface px-4 text-sm font-semibold text-body hover:border-primary hover:text-primary"
              >
                <DashIcon name={group.icon} className="size-4 text-muted" />
                {group.title}
              </a>
            ))}
          </nav>

          <FaqAccordion groups={content.faqs} />
        </div>
      </section>

      {/* Still stuck */}
      <section className="container-site pt-14">
        <div className="rounded-panel border border-line bg-surface p-8 text-center">
          <h2 className="text-h3 text-ink">{t("stuckTitle")}</h2>
          <p className="mx-auto mt-2 max-w-lg text-body">{t("stuckBody")}</p>
          <a
            href="mailto:support@foodora.example.com"
            className="mt-5 inline-flex h-11 items-center rounded-pill bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-600"
          >
            {t("stuckAction")}
          </a>
        </div>
      </section>
    </div>
  );
}
