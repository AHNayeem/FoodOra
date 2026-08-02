"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Play, X } from "lucide-react";
import type { ReviewMedia } from "@/frontend/types";
import { Modal } from "@/frontend/components/ui/modal";

/**
 * ReviewMediaStrip — the photos (and videos) attached to a review, plus the
 * lightbox that opens one (spec: Photo Review / Video Review).
 *
 * A video is the same row as a photo with a poster frame, so both render as one
 * thumbnail grid and only the play badge and the lightbox element differ. The
 * prototype's corpus ships photos; the shape is what a video upload lands in.
 */
export function ReviewMediaStrip({
  media,
  authorName,
}: {
  media: ReviewMedia[];
  authorName: string;
}) {
  const t = useTranslations("reviews");
  const [open, setOpen] = useState<ReviewMedia | null>(null);

  if (media.length === 0) return null;

  return (
    <>
      <ul className="mt-3 flex flex-wrap gap-2">
        {media.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(item)}
              className="relative block size-20 overflow-hidden rounded-card border border-line transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Image
                src={item.thumbnail}
                alt={t("photoBy", { name: authorName })}
                fill
                sizes="80px"
                className="object-cover"
              />
              {item.kind === "video" && (
                <span className="absolute inset-0 flex items-center justify-center bg-ink/40 text-white">
                  <Play className="size-6 fill-current" aria-hidden />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        className="sm:max-w-2xl"
      >
        {open && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label={t("closePhoto")}
              className="absolute end-3 top-3 z-10 inline-flex size-9 items-center justify-center rounded-pill bg-ink/60 text-white hover:bg-ink/80"
            >
              <X className="size-5" aria-hidden />
            </button>
            {open.kind === "video" ? (
              // A customer upload has no caption track to offer.
              <video src={open.url} poster={open.thumbnail} controls className="w-full" />
            ) : (
              <Image
                src={open.url}
                alt={t("photoBy", { name: authorName })}
                width={1200}
                height={800}
                sizes="(min-width: 640px) 42rem, 100vw"
                className="h-auto w-full object-contain"
              />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
