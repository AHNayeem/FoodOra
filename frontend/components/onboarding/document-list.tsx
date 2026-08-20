"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { FileCheck2, FileX2, Loader2, Paperclip } from "lucide-react";
import type { DocumentStatus, OnboardingDocument, OnboardingDocumentKind } from "@/types";
import { isDocumentValid } from "@/lib/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentStatusChip } from "./status-chip";
import { cn } from "@/lib/utils";

/**
 * DocumentList — the paperwork, and (for a reviewer) what to do about it
 * (Phases 6–7).
 *
 * One component, two audiences, differing by `onReview`: the applicant sees what
 * they have provided and what is still outstanding, the reviewer sees the same list
 * with verify/refuse on each row. Splitting it would let the two drift, and the
 * thing that must not drift is *which documents exist* — an applicant who cannot see
 * the row a reviewer is refusing has nothing to fix.
 *
 * Expiry is shown from the clock rather than from the stored status, through
 * `isDocumentValid`: a certificate marked verified last year and lapsed last month
 * is still stored as verified, and a list that repeated the field would tell a
 * reviewer everything was fine.
 */
export function DocumentList({
  documents,
  required,
  now,
  onReview,
  onUpload,
  className,
}: {
  documents: OnboardingDocument[];
  /** The kinds an approval cannot skip — marked, so nobody guesses. */
  required: readonly OnboardingDocumentKind[];
  now: number;
  /** Reviewer mode: verify or refuse a row. */
  onReview?: (
    kind: OnboardingDocumentKind,
    status: DocumentStatus,
    note: string | null,
  ) => void;
  /** Applicant mode: attach a reference to a row. */
  onUpload?: (kind: OnboardingDocumentKind, reference: string) => void;
  className?: string;
}) {
  const t = useTranslations("onboarding");
  const format = useFormatter();
  const [refusing, setRefusing] = useState<OnboardingDocumentKind | null>(null);
  const [reason, setReason] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  return (
    <ul className={cn("divide-y divide-line overflow-hidden rounded-card border border-line bg-surface", className)}>
      {documents.map((document) => {
        const lapsed = document.status === "verified" && !isDocumentValid(document, now);
        const shown: DocumentStatus = lapsed ? "expired" : document.status;
        const isRequired = required.includes(document.kind);
        return (
          <li key={document.kind} className="p-3.5">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-muted">
                <Paperclip className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                  {t(`document.${document.kind}`)}
                  <DocumentStatusChip status={shown} />
                  {isRequired && (
                    <span className="text-[11px] font-bold uppercase tracking-wide text-danger">
                      {t("documentRequired")}
                    </span>
                  )}
                </p>
                {document.reference ? (
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">
                    {document.reference}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted">{t("documentNotProvided")}</p>
                )}
                {document.expiresAt && (
                  <p className="mt-0.5 text-[11px] text-muted">
                    {t(lapsed ? "documentExpired" : "documentExpires", {
                      date: format.dateTime(new Date(document.expiresAt), {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }),
                    })}
                  </p>
                )}
                {document.note && (
                  <p className="mt-1 text-xs text-danger">{document.note}</p>
                )}
              </div>

              {onReview && document.status !== "missing" && (
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onReview(document.kind, "verified", null)}
                  >
                    <FileCheck2 className="size-3.5" aria-hidden />
                    {t("verify")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRefusing(document.kind);
                      setReason("");
                    }}
                  >
                    <FileX2 className="size-3.5" aria-hidden />
                    {t("refuse")}
                  </Button>
                </div>
              )}
            </div>

            {/* A refusal needs a sentence, so the field appears with the action
                rather than the refusal going through without one. */}
            {onReview && refusing === document.kind && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("refuseReasonPlaceholder")}
                  aria-label={t("refuseReasonLabel")}
                  className="min-w-48 flex-1"
                />
                <Button
                  size="sm"
                  disabled={reason.trim().length < 4}
                  onClick={() => {
                    onReview(document.kind, "rejected", reason.trim());
                    setRefusing(null);
                    setReason("");
                  }}
                >
                  {t("refuseConfirm")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRefusing(null)}>
                  {t("cancel")}
                </Button>
              </div>
            )}

            {onUpload && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Input
                  value={drafts[document.kind] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [document.kind]: e.target.value }))
                  }
                  placeholder={t("uploadPlaceholder")}
                  aria-label={t("uploadLabel", { document: t(`document.${document.kind}`) })}
                  className="min-w-48 flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(drafts[document.kind] ?? "").trim().length < 3}
                  onClick={() => {
                    onUpload(document.kind, (drafts[document.kind] ?? "").trim());
                    setDrafts((d) => ({ ...d, [document.kind]: "" }));
                  }}
                >
                  {t("attach")}
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The prototype has no file storage, so "uploading" is typing the document's
 * reference number. Stated on screen rather than faked with a file input that
 * silently discards the file — a picker that appears to accept a PDF and keeps
 * nothing is the kind of decoration this prototype is meant not to have.
 */
export function UploadNotice() {
  const t = useTranslations("onboarding");
  return (
    <p className="flex items-start gap-2 rounded-card border border-dashed border-line bg-surface-muted/50 p-3 text-xs text-muted">
      <Loader2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {t("uploadNotice")}
    </p>
  );
}
