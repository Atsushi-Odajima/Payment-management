import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { validateAgentInput } from "@/lib/agents/schema";
import { AGENT_SELECT } from "../select";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";

type Ctx = { params: { id: string } };

export const GET = withApiHandler<Ctx>(async (_req, { params }) => {
  const agent = await prisma.agent.findUnique({ where: { id: params.id }, select: AGENT_SELECT });
  if (!agent) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(agent);
});

/** PATCH /api/agents/:id — update editable fields (agentCode is immutable). */
export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
  const v = validateAgentInput(await readJson(req));
  if (!v.ok) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: v.errors });
  const existing = await prisma.agent.findUnique({ where: { id: params.id }, select: AGENT_SELECT });
  if (!existing) throw new ApiError(404, "not_found", "errors.notFound");
  const audit = await auditContextFromRequest(req);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.agent.update({ where: { id: params.id }, data: v.data, select: AGENT_SELECT });
    await recordAudit(tx, audit, { action: "agent.update", targetType: "agent", targetId: row.id, before: existing, after: row });
    return row;
  });
  return ok(updated);
});
