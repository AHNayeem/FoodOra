import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Sparkles } from "lucide-react";
import { interpretSearch } from "@/services/ai";
import { resolveSayValues } from "./vocabulary";

/**
 * AiSearchNote — what the assistant made of a search query (spec: AI Search).
 *
 * A server component on the results page, and the plainest demonstration of the
 * claim `lib/ai` makes: the assistant's *entire* understanding of a sentence is
 * a set of search facets, so it can be shown as chips and applied as an ordinary
 * link. Nothing is hidden behind the reading.
 *
 * Renders nothing for a short query — "pizza" needs no interpreting, and a
 * banner over an obvious search is noise — and nothing when the parse found
 * fewer than two constraints (see `interpretSearch`).
 */
export async function AiSearchNote({ query }: { query: string }) {
  const interpretation = await interpretSearch(query);
  if (!interpretation) return null;

  const t = await getTranslations("ai");
  const { chips, href, parsed } = interpretation;

  return (
    <aside className="mt-6 rounded-card border border-primary-100 bg-primary-50 p-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-primary" aria-hidden />
          {t("search.understood")}
        </span>
        {chips.map((chip, index) => (
          <span
            key={`${chip.key}-${index}`}
            className="rounded-pill bg-surface px-2.5 py-1 text-xs font-medium text-body"
          >
            {t(chip.key, resolveSayValues(chip.values, t))}
          </span>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          {t("search.apply")}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
        {parsed.confidence < 0.5 && (
          <span className="text-xs text-muted">{t("search.unsure")}</span>
        )}
      </div>
    </aside>
  );
}

