"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2, Clock, Phone } from "lucide-react";
import type { CmsContactContent, CmsContactTopic } from "@/frontend/types";
import { splitParagraphs } from "@/frontend/lib/cms";
import { CONTACT_MESSAGE_LIMIT, submitContactMessage } from "@/frontend/services/cms";
import { useCms } from "@/frontend/stores/cms";
import { useAuth } from "@/frontend/stores/auth";
import { useCmsContact } from "@/frontend/components/cms/use-cms-content";
import { SupportChannels } from "@/frontend/components/marketing/support-channels";
import { PageHero } from "@/frontend/components/marketing/marketing-blocks";
import { SectionHeading } from "@/frontend/components/sections/section-heading";
import { Button } from "@/frontend/components/ui/button";
import { Field } from "@/frontend/components/ui/field";
import { Input } from "@/frontend/components/ui/input";

const TOPICS: CmsContactTopic[] = ["order", "partner", "rider", "press", "other"];

/**
 * ContactPage (spec: CMS — Contact) — the page the footer has always needed.
 *
 * Every word of it is a CMS document, including the form's heading and its
 * honesty note: nothing is emailed, because the prototype has no mail provider.
 * What *is* real is the rule set — `services/cms.submitContactMessage` refuses a
 * short message, a malformed address or an unknown topic with an i18n key — and
 * the record: an accepted message lands in operations' inbox through C25's own
 * notification gate, so the demo has somewhere to show it arriving.
 */
export function ContactPage({ content }: { content: CmsContactContent }) {
  const t = useTranslations("contact");
  const page = useCmsContact(content);
  const user = useAuth((s) => s.user);
  const recordMessage = useCms((s) => s.recordMessage);

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [topic, setTopic] = useState<CmsContactTopic>("order");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    const result = await submitContactMessage({ name, email, topic, message });
    setSending(false);

    if (result.error || !result.data) {
      toast.error(t((result.error ?? "cms.contact.errors.short").replace(/^cms\.contact\./, "")));
      return;
    }

    recordMessage(result.data);
    setMessage("");
    setSent(true);
    toast.success(t("sent"));
  }

  return (
    <div className="pb-16">
      <PageHero eyebrow={page.eyebrow} title={page.title} lead={page.lead} docKey="contact" />

      <section className="container-site py-14">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          {/* Channels */}
          <div>
            <SectionHeading title={t("channelsTitle")} subtitle={t("channelsSubtitle")} />
            <SupportChannels channels={page.channels} source="given" />

            <div className="mt-10 flex flex-col gap-5">
              {splitParagraphs(page.intro).map((paragraph) => (
                <p key={paragraph} className="leading-relaxed text-body">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="rounded-panel border border-line bg-surface p-6 md:p-8">
            <h2 className="text-h3 text-ink">{page.formTitle || t("formTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{page.formNote}</p>

            <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
              <Field id="contact-name" label={t("name")}>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                )}
              </Field>

              <Field id="contact-email" label={t("email")}>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="email"
                    aria-describedby={describedBy}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                )}
              </Field>

              <Field id="contact-topic" label={t("topic")}>
                {({ id, describedBy }) => (
                  <select
                    id={id}
                    aria-describedby={describedBy}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value as CmsContactTopic)}
                    className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    {TOPICS.map((value) => (
                      <option key={value} value={value}>
                        {t(`topics.${value}`)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field
                id="contact-message"
                label={t("message")}
                hint={t("messageHint", { count: CONTACT_MESSAGE_LIMIT - message.length })}
              >
                {({ id, describedBy }) => (
                  <textarea
                    id={id}
                    aria-describedby={describedBy}
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, CONTACT_MESSAGE_LIMIT))}
                    rows={6}
                    required
                    className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                  />
                )}
              </Field>

              <Button type="submit" size="lg" disabled={sending}>
                {sending ? t("sending") : t("send")}
              </Button>

              {sent && (
                <p aria-live="polite" className="text-sm font-medium text-success">
                  {t("sentNote")}
                </p>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* Offices */}
      {page.offices.length > 0 && (
        <section className="border-t border-line bg-surface-muted py-14">
          <div className="container-site">
            <SectionHeading title={t("officesTitle")} subtitle={t("officesSubtitle")} />
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {page.offices.map((office) => (
                <li key={office.city} className="rounded-panel border border-line bg-surface p-6">
                  <span className="inline-flex size-11 items-center justify-center rounded-pill bg-primary/10 text-primary">
                    <Building2 className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-ink">{office.city}</h3>
                  <p className="mt-2 text-body">{office.address}</p>
                  <dl className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
                    {office.phone && (
                      <div className="inline-flex items-center gap-2">
                        <Phone className="size-4" aria-hidden />
                        <dt className="sr-only">{t("phone")}</dt>
                        <dd>{office.phone}</dd>
                      </div>
                    )}
                    {office.hours && (
                      <div className="inline-flex items-center gap-2">
                        <Clock className="size-4" aria-hidden />
                        <dt className="sr-only">{t("hours")}</dt>
                        <dd>{office.hours}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
