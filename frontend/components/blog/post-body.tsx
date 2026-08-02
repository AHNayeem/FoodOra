import type { BlogBlock } from "@/frontend/types";

/**
 * PostBody — renders structured article content. Switching on the discriminated
 * `type` keeps the markup typed and exhaustive, and means the content layer
 * never has to ship HTML for us to inject.
 */
export function PostBody({ blocks }: { blocks: BlogBlock[] }) {
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return (
              <h2 key={i} className="text-h3 mt-3 text-ink">
                {block.text}
              </h2>
            );
          case "paragraph":
            return (
              <p key={i} className="text-lg leading-relaxed text-body">
                {block.text}
              </p>
            );
          case "list":
            return (
              <ul key={i} className="flex flex-col gap-2.5 ps-1">
                {block.items.map((item) => (
                  <li key={item} className="flex gap-3 text-lg leading-relaxed text-body">
                    <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <figure
                key={i}
                className="border-s-4 border-primary bg-surface-muted py-4 pe-4 ps-5"
              >
                <blockquote className="text-lg font-medium italic text-ink">
                  “{block.text}”
                </blockquote>
                {block.cite && (
                  <figcaption className="mt-2 text-sm text-muted">— {block.cite}</figcaption>
                )}
              </figure>
            );
        }
      })}
    </div>
  );
}
