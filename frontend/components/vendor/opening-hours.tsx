import { getTranslations } from "next-intl/server";
import type { WeeklyHours } from "@/frontend/types";

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** OpeningHours — weekly hours table for the restaurant info panel (Phase C5). */
export async function OpeningHours({ hours }: { hours: WeeklyHours }) {
  const t = await getTranslations();

  return (
    <dl className="flex flex-col gap-2 text-sm">
      {DAY_ORDER.map((day) => {
        const { open, close } = hours[day];
        const closed = !open || !close;
        return (
          <div key={day} className="flex items-center justify-between gap-4">
            <dt className="text-body">{t(`days.${day}`)}</dt>
            <dd className={closed ? "text-muted" : "font-medium text-ink"}>
              {closed ? t("restaurant.closedToday") : `${open} – ${close}`}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
