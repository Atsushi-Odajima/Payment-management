import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/api/role-guard";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { validateAgentInput } from "@/lib/agents/schema";
import { nextAgentCode } from "@/lib/agents/ids";
import { isUniqueViolation } from "@/lib/ids";
import { DEMO_LIMITS } from "@/lib/demo";
import { AGENT_SELECT } from "./select";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";

export const GET = withApiHandler(async () => {
  const agents = await prisma.agent.findMany({
    orderBy: { agentCode: "asc" },
    select: { ...AGENT_SELECT, _count: { select: { merchants: true } } },
  });
  return ok({ agents });
});

/** POST /api/agents — register an agent; agentCode is auto-numbered. */
export const POST = withApiHandler(async (req) => {
    await requirePermission(req, "agent", "create");
  const v = validateAgentInput(await readJson(req));
  if (!v.ok) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: v.errors });
  const count = await prisma.agent.count();
  if (count >= DEMO_LIMITS.agents) {
    throw new ApiError(403, "demo_limit", "errors.demoLimit", { limit: DEMO_LIMITS.agents });
  }
  const audit = await auditContextFromRequest(req);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const agentCode = await nextAgentCode(tx);
        const row = await tx.agent.create({ data: { ...v.data, agentCode }, select: AGENT_SELECT });
        await recordAudit(tx, audit, { action: "agent.create", targetType: "agent", targetId: row.id, after: row });
        return row;
      });
      return ok(created, { status: 201 });
    } catch (err) {
      if (attempt === 0 && isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new ApiError(409, "conflict", "errors.conflict");
});
