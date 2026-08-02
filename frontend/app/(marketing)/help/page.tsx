import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getHelpContent } from "@/services/pages";
import { getRouteMetadata, readOptions } from "@/services/cms";
import { FaqAccordion, PageHero } from "@/components/marketing/marketing-blocks";
import { SupportChannels } from "@/components/marketing/support-channels";
import { DashIcon } from "@/components/directory/dash-icon";
import { SectionHeading } from "@/components/sections/section-heading";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return getRouteMetadata("/help", readOptions(locale, (key) => t(key)), {
    title: t("help.metaTitle"),
    description: t("help.metaDescription"),
  });
}

/**
 * Help centre (spec: CMS — FAQs, Contact). Contact channels first, because
 * someone with a live order should not have to scroll past an FAQ to reach
 * support, then the grouped questions with an anchor list to jump between them.
 */
export default async function HelpPage() {
  const [t, locale] = await Promise.all([getTranslations("help"), getLocale()]);
  const root = await getTranslations();
  const content = await getHelpContent({ locale, translate: (key) => root(key) });

  return (
    <div className="pb-16">
      <PageHero
        eyebrow={content.hero.eyebrow || t("eyebrow")}
        title={content.hero.title || t("title")}
        lead={content.hero.lead || t("lead")}
        docKey="help"
      />

      {/* Contact channels */}
      <section className="container-site py-14">
        <SectionHeading title={t("channelsTitle")} subtitle={t("channelsSubtitle")} />
        <SupportChannels channels={content.channels} />
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

          <FaqAccordion groups={content.faqs} surface="help" />
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
