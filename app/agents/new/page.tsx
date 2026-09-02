import { prisma } from "@/lib/db";
import { AgentNewView } from "@/components/views/agent-new-view";
import { nextAgentCode } from "@/lib/agents/ids";

export const dynamic = "force-dynamic";

export default async function NewAgentPage() {
  const nextCode = await nextAgentCode(prisma);
  return <AgentNewView nextCode={nextCode} />;
}
