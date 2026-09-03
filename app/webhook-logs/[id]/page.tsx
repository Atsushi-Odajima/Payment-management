import { notFound } from "next/navigation";
import { WebhookLogDetailView } from "@/components/views/webhook-log-detail-view";
import { loadWebhookDelivery } from "@/lib/webhooks/list";

export const dynamic = "force-dynamic";

export default async function WebhookLogDetailPage({ params }: { params: { id: string } }) {
  const delivery = await loadWebhookDelivery(params.id);
  if (!delivery) notFound();
  return <WebhookLogDetailView delivery={delivery} />;
}
