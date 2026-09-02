import { prisma } from "@/lib/db";
import { MerchantNewView } from "@/components/views/merchant-new-view";
import { nextMerchantCode } from "@/lib/merchants/ids";

export const dynamic = "force-dynamic";

export default async function NewMerchantPage() {
  // Provisional: the definitive code is assigned inside the create transaction.
  const [nextCode, agents] = await Promise.all([
    nextMerchantCode(prisma),
    prisma.agent.findMany({ where: { status: "active" }, orderBy: { agentCode: "asc" }, select: { id: true, agentCode: true, name: true, status: true } }),
  ]);
  return <MerchantNewView nextCode={nextCode} agents={agents} />;
}
