import { notFound } from "next/navigation";
import { RefundDetailView } from "@/components/views/refund-detail-view";
import { loadRefund } from "@/lib/refunds/list";

export const dynamic = "force-dynamic";

export default async function RefundDetailPage({ params }: { params: { id: string } }) {
  const refund = await loadRefund(params.id);
  if (!refund) notFound();
  return <RefundDetailView refund={refund} />;
}
