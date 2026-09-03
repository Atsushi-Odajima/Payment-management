import { SubscriptionNewView } from "@/components/views/subscription-new-view";
import { requireAdminPage } from "@/lib/admin/page-guard";
import { loadPlans } from "@/lib/subscriptions/list";

export const dynamic = "force-dynamic";

export default async function SubscriptionNewPage() {
  await requireAdminPage();
  const plans = await loadPlans();
  return <SubscriptionNewView plans={plans} />;
}
