import { getTranslations } from "next-intl/server";
import { getPlansByVendor, planFromPrice } from "@/services/subscriptions";
import { MealPlanCard } from "./meal-plan-card";

/**
 * VendorPlans — the "subscribe to this kitchen" band on a vendor page
 * (Phase C15). This is the hook C13 deferred here: a home chef's weekly menu
 * and subscription meals are a plan, so the vendor page links straight into
 * them. Renders nothing when the kitchen runs no plans.
 */
export async function VendorPlans({
  vendorId,
  vendorName,
}: {
  vendorId: string;
  vendorName: string;
}) {
  const [plans, t] = await Promise.all([
    getPlansByVendor(vendorId),
    getTranslations("subscriptions"),
  ]);
  if (plans.length === 0) return null;

  return (
    <section>
      <h2 className="text-h2 text-ink">{t("vendorPlansTitle")}</h2>
      <p className="mt-1 text-body">{t("vendorPlansSubtitle", { name: vendorName })}</p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {plans.map((plan) => (
          <MealPlanCard key={plan.id} plan={plan} fromPrice={planFromPrice(plan.id)} />
        ))}
      </div>
    </section>
  );
}
