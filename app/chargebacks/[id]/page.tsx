import { notFound } from "next/navigation";
import { ChargebackDetailView } from "@/components/views/chargeback-detail-view";
import { loadChargeback } from "@/lib/chargebacks/list";

export const dynamic = "force-dynamic";

export default async function ChargebackDetailPage({ params }: { params: { id: string } }) {
  const chargeback = await loadChargeback(params.id);
  if (!chargeback) notFound();
  return <ChargebackDetailView chargeback={chargeback} />;
}
