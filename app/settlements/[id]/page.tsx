import { notFound } from "next/navigation";
import { SettlementDetailView } from "@/components/views/settlement-detail-view";
import { loadSettlement } from "@/lib/settlements/list";

export const dynamic = "force-dynamic";

export default async function SettlementDetailPage({ params }: { params: { id: string } }) {
  const data = await loadSettlement(params.id);
  if (!data) notFound();
  return <SettlementDetailView batch={data.batch} lines={data.lines} />;
}
