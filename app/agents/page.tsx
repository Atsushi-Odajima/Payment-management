import { prisma } from "@/lib/db";
import { AgentsView } from "@/components/views/agents-view";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/components/pagination";
import { isAgentStatus } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

export default async function AgentsPage({ searchParams }: { searchParams?: { page?: string } }) {
  const page = parsePage(searchParams?.page);
  const [rows, total] = await Promise.all([
    prisma.agent.findMany({
      orderBy: { agentCode: "asc" },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
      select: {
        id: true,
        agentCode: true,
        name: true,
        companyName: true,
        contactName: true,
        feeRate: true,
        status: true,
        createdAt: true,
        _count: { select: { merchants: true } },
      },
    }),
    prisma.agent.count(),
  ]);

  return (
    <AgentsView
      agents={rows.map((a) => ({
        id: a.id,
        agentCode: a.agentCode,
        name: a.name,
        companyName: a.companyName,
        contactName: a.contactName,
        feeRate: a.feeRate,
        status: isAgentStatus(a.status) ? a.status : "disabled",
        merchantCount: a._count.merchants,
        createdAt: a.createdAt,
      }))}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      total={total}
    />
  );
}
