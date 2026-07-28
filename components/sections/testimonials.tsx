import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Quote, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Testimonial } from "@/types";

/** Five stars, filled up to `value`. Decorative — rating is conveyed in text too. */
function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "size-4",
            i < value ? "fill-rating text-rating" : "text-line",
          )}
        />
      ))}
    </span>
  );
}

/**
 * Testimonials — social-proof grid (server component). Cards receive data via
 * props from the page's services seam; headings come from the `home` namespace.
 */
export async function Testimonials({ items }: { items: Testimonial[] }) {
  const t = await getTranslations("home");
  if (items.length === 0) return null;

  return (
    <section className="bg-surface-muted">
      <div className="container-site py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-h2 text-ink">{t("testimonialsTitle")}</h2>
          <p className="mt-2 text-body">{t("testimonialsSubtitle")}</p>
        </div>

        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="relative flex flex-col rounded-card bg-surface p-6 shadow-card"
            >
              <Quote
                className="size-8 text-primary/25 rtl:-scale-x-100"
                aria-hidden
              />
              <Stars value={item.rating} />
              <span className="sr-only">{t("ratingOutOf", { value: item.rating })}</span>
              <blockquote className="mt-3 flex-1 text-body">
                “{item.quote}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <Image
                  src={item.avatar}
                  alt=""
                  width={44}
                  height={44}
                  className="size-11 rounded-pill object-cover"
                />
                <span className="leading-tight">
                  <span className="block font-semibold text-ink">{item.name}</span>
                  <span className="block text-sm text-muted">{item.role}</span>
                </span>
              </figcaption>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
