import { notFound } from "next/navigation";
import { SettlementDetailView } from "@/components/views/settlement-detail-view";
import { prisma } from "@/lib/db";
import { loadSettlement } from "@/lib/settlements/list";
import { loadGlobalSettings } from "@/lib/settings/global";

export const dynamic = "force-dynamic";

export default async function SettlementDetailPage({ params }: { params: { id: string } }) {
  const data = await loadSettlement(params.id);
  if (!data) notFound();
  const settings = await loadGlobalSettings(prisma);
  return <SettlementDetailView batch={data.batch} lines={data.lines} taxRounding={settings.taxRounding} />;
}
