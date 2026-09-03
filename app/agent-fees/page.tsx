import { cookies } from "next/headers";
import { AgentFeesView } from "@/components/views/agent-fees-view";
import { buildAgentFees, parseAgentFeeFilters } from "@/lib/agent-fees/service";
import { modeFromCookieStore } from "@/lib/mode";

export const dynamic = "force-dynamic";

export default async function AgentFeesPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const filters = parseAgentFeeFilters(searchParams, modeFromCookieStore(cookies()));
  const { rows, agents } = await buildAgentFees(filters);
  return <AgentFeesView rows={rows} agents={agents} filters={filters} />;
}
