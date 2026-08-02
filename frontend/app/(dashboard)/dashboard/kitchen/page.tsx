import { KitchenQueue } from "@/frontend/components/dashboard/kitchen-queue";

/**
 * Kitchen queue — the pass view. Reads the same live order store as the order
 * board; the split is by *question*, not by data (see `KitchenQueue`).
 */
export default function DashboardKitchenPage() {
  return <KitchenQueue />;
}
