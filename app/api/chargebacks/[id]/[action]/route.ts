import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { confirmChargeback, disputeChargeback, resolveChargeback } from "@/lib/chargebacks/service";
import { chargebackDisputeSchema, chargebackResolveSchema, isChargebackAction } from "@/lib/chargebacks/types";

/**
 * POST /api/chargebacks/:id/:action — dispute { evidenceNote } | resolve
 * { outcome: won | lost, note } | confirm (master).
 */
export const POST = withApiHandler<{ params: { id: string; action: string } }>(async (req, { params }) => {
  if (!isChargebackAction(params.action)) throw new ApiError(404, "invalid_action", "errors.invalidAction");
  await requireMaster(req);
  const audit = await auditContextFromRequest(req);
  if (params.action === "dispute") {
    const parsed = chargebackDisputeSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { evidenceNote: "required" } });
    return ok(await disputeChargeback(prisma, { id: params.id, evidenceNote: parsed.data.evidenceNote, audit }));
  }
  if (params.action === "resolve") {
    const parsed = chargebackResolveSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { outcome: "required" } });
    return ok(await resolveChargeback(prisma, { id: params.id, outcome: parsed.data.outcome, note: parsed.data.note, audit }));
  }
  return ok(await confirmChargeback(prisma, { id: params.id, audit }));
});
