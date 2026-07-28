import Image from "next/image";
import { useTranslations } from "next-intl";
import type { BestSeller } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { formatPrice } from "@/lib/format";

/**
 * BestSellers — ranked list of the top menu items by units sold over the
 * reporting window, with a proportional bar for quick visual comparison.
 */
export function BestSellers({
  items,
  currency,
}: {
  items: BestSeller[];
  currency: CurrencyCode;
}) {
  const t = useTranslations("dashboard");
  const max = Math.max(1, ...items.map((i) => i.unitsSold));

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{t("noData")}</p>;
  }

  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={item.foodId} className="flex items-center gap-3">
          <span className="w-4 shrink-0 text-sm font-bold text-muted tabular-nums">
            {index + 1}
          </span>
          <Image
            src={item.image}
            alt=""
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-field object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-pill bg-surface-muted">
              <div
                className="h-full rounded-pill bg-primary"
                style={{ width: `${(item.unitsSold / max) * 100}%` }}
              />
            </div>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-sm font-bold text-ink tabular-nums">
              {t("unitsSold", { count: item.unitsSold })}
            </p>
            <p className="text-xs text-muted tabular-nums">
              {formatPrice(item.revenue, currency)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
