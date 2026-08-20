"use client";

import { useFormatter, useTranslations } from "next-intl";
import { CheckCircle2, FileText, Pencil, Send, StickyNote } from "lucide-react";
import type { OnboardingEvent, OnboardingEventKind } from "@/types";
import { cn } from "@/lib/utils";

const ICONS: Record<OnboardingEventKind, typeof Send> = {
  edited: Pencil,
  submitted: Send,
  decision: CheckCircle2,
  document: FileText,
  note: StickyNote,
};

/**
 * ApplicationLog — the append-only history of an application (Phases 6–7).
 *
 * One renderer for the restaurant and the rider queues, and for the applicant's own
 * view of their application, because the log is the same log. The alternative —
 * three components reading the same array — is three chances for one of them to
 * quietly stop showing a kind of event that was added later.
 *
 * Rendered oldest-first, unlike every other list in the admin: this is a story, and
 * a story read backwards makes the decision appear before the thing it decided.
 */
export function ApplicationLog({
  events,
  className,
}: {
  events: OnboardingEvent[];
  className?: string;
}) {
  const t = useTranslations("onboarding");
  const format = useFormatter();

  if (events.length === 0) {
    return <p className={cn("text-sm text-muted", className)}>{t("logEmpty")}</p>;
  }

  return (
    <ol className={cn("space-y-3", className)}>
      {events.map((event) => {
        const Icon = ICONS[event.kind];
        return (
          <li key={event.id} className="flex gap-3">
            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-muted">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {event.kind === "decision" && event.status
                  ? t(`log.decision.${event.status}`, { name: event.authorName })
                  : event.kind === "document" && event.document
                    ? t("log.document", {
                        name: event.authorName,
                        document: t(`document.${event.document}`),
                      })
                    : t(`log.${event.kind}`, { name: event.authorName })}
              </p>
              {event.body && <p className="mt-0.5 text-sm text-body">{event.body}</p>}
              <p className="mt-0.5 text-[11px] text-muted">
                {format.dateTime(new Date(event.at), {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
