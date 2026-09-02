import type { Prisma } from "@prisma/client";
import { nextCode } from "@/lib/ids";
import { AGENT_CODE_PREFIX } from "./types";

/** Next sequential agent code (AGT-00001, AGT-00002 …). */
export async function nextAgentCode(tx: Prisma.TransactionClient): Promise<string> {
  return nextCode(AGENT_CODE_PREFIX, async () => {
    const last = await tx.agent.findFirst({ orderBy: { agentCode: "desc" }, select: { agentCode: true } });
    return last?.agentCode ?? null;
  });
}
