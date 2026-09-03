import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { transitionBatch } from "@/lib/settlements/service";
import { holdSchema, isSettlementAction } from "@/lib/settlements/types";

/**
 * POST /api/settlements/:id/:action — confirm | schedule | pay | hold | release
 * (master). hold takes { reason }.
 */
export const POST = withApiHandler<{ params: { id: string; action: string } }>(async (req, { params }) => {
  if (!isSettlementAction(params.action)) throw new ApiError(404, "invalid_action", "errors.invalidAction");
  await requireMaster(req);
  let reason: string | undefined;
  if (params.action === "hold") {
    const parsed = holdSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { reason: "required" } });
    reason = parsed.data.reason;
  }
  const batch = await transitionBatch(prisma, { batchId: params.id, action: params.action, reason, audit: await auditContextFromRequest(req) });
  return ok(batch);
});
