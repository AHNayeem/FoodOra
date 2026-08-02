import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRating, formatCompact } from "@/lib/format";

/**
 * Rating — compact star + numeric rating with optional review count.
 * Used on vendor and food cards.
 */
export function Rating({
  value,
  count,
  className,
}: {
  value: number;
  count?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", className)}>
      <Star className="size-4 fill-rating text-rating" aria-hidden />
      <span className="text-ink">{formatRating(value)}</span>
      {count !== undefined && (
        <span className="font-normal text-muted">({formatCompact(count)})</span>
      )}
    </span>
  );
}
