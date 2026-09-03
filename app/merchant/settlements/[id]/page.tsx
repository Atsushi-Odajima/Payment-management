import { notFound } from "next/navigation";
import { MerchantSettlementDetailView } from "@/components/views/merchant/settlements-view";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";
import { loadSettlement } from "@/lib/settlements/list";

export const dynamic = "force-dynamic";

export default async function MerchantSettlementDetailPage({ params }: { params: { id: string } }) {
  const m = await requireMerchantPage();
  const data = await loadSettlement(params.id);
  if (!data || data.batch.merchant.id !== m.id) notFound();
  return <MerchantSettlementDetailView batch={data.batch} lines={data.lines} />;
}
