import { notFound } from "next/navigation";
import { SubscriptionDetailView } from "@/components/views/subscription-detail-view";
import { loadSubscription } from "@/lib/subscriptions/list";

export const dynamic = "force-dynamic";

export default async function SubscriptionDetailPage({ params }: { params: { id: string } }) {
  const data = await loadSubscription(params.id);
  if (!data) notFound();
  return <SubscriptionDetailView subscription={data.subscription} charges={data.charges} />;
}
