import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AgentDetailView } from "@/components/views/agent-detail-view";
import { AGENT_SELECT } from "@/app/api/agents/select";
import { isAgentStatus } from "@/lib/agents/types";
import { cookies } from "next/headers";
import { modeFromCookieStore } from "@/lib/mode";
import { buildAgentFees, parseAgentFeeFilters } from "@/lib/agent-fees/service";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: { id: string } }) {
  const agent = await prisma.agent.findUnique({
    where: { id: params.id },
    select: {
      ...AGENT_SELECT,
      merchants: {
        orderBy: { merchantCode: "asc" },
        select: { id: true, merchantCode: true, siteName: true, companyName: true, createdAt: true },
      },
    },
  });
  if (!agent) notFound();
  const { merchants, ...rest } = agent;
  const filters = parseAgentFeeFilters({ agent: agent.id }, modeFromCookieStore(cookies()));
  const { rows } = await buildAgentFees(filters);
  const row = rows.find((r) => r.agentId === agent.id);
  const fees = { month: filters.month, netAmount: row?.netAmount ?? 0, fee: row?.fee ?? 0, batchCount: row?.batchCount ?? 0 };
  return (
    <AgentDetailView
      agent={{ ...rest, status: isAgentStatus(rest.status) ? rest.status : "disabled" }}
      merchants={merchants}
      fees={fees}
    />
  );
}
