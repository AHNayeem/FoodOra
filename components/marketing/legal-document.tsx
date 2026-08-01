import { getFormatter, getTranslations } from "next-intl/server";
import type { LegalDoc } from "@/types";

/**
 * LegalDocument — renders a {@link LegalDoc}: title, effective date, intro, an
 * in-page contents list and the numbered sections. Shared by `/terms` and
 * `/privacy` so both stay identical in structure and neither holds any copy.
 */
export async function LegalDocument({ doc }: { doc: LegalDoc }) {
  const [t, format] = await Promise.all([getTranslations("legal"), getFormatter()]);

  return (
    <div className="pb-16">
      <header className="border-b border-line bg-surface-muted">
        <div className="container-site py-12 md:py-16">
          <h1 className="text-display max-w-3xl text-ink">{doc.title}</h1>
          <p className="mt-3 text-sm font-semibold text-muted">
            {t("effectiveFrom", {
              date: format.dateTime(new Date(doc.effectiveFrom), {
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
            })}
          </p>
        </div>
      </header>

      <div className="container-site py-10">
        <div className="mx-auto max-w-3xl">
          <p className="text-lg leading-relaxed text-body">{doc.intro}</p>

          {/* Contents */}
          <nav
            aria-label={t("contents")}
            className="mt-8 rounded-panel border border-line bg-surface-muted p-6"
          >
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
              {t("contents")}
            </h2>
            <ol className="mt-3 flex flex-col gap-2">
              {doc.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-sm text-body transition-colors hover:text-primary"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Sections */}
          <div className="mt-12 flex flex-col gap-10">
            {doc.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="text-h3 text-ink">{section.heading}</h2>
                <div className="mt-3 flex flex-col gap-4">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="leading-relaxed text-body">
                      {paragraph}
                    </p>
                  ))}
                </div>
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3 leading-relaxed text-body">
                        <span
                          aria-hidden
                          className="mt-2 size-1.5 shrink-0 rounded-pill bg-primary"
                        />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
            {t("questions")}{" "}
            <a
              href="mailto:legal@foodora.example.com"
              className="font-semibold text-primary hover:underline"
            >
              legal@foodora.example.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
