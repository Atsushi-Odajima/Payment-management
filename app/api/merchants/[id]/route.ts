import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/api/role-guard";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { validateMerchantInput } from "@/lib/merchants/schema";
import { MERCHANT_SELECT, serialize, toMerchantData } from "../select";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";

type Ctx = { params: { id: string } };

export const GET = withApiHandler<Ctx>(async (_req, { params }) => {
  const merchant = await prisma.merchant.findUnique({ where: { id: params.id }, select: MERCHANT_SELECT });
  if (!merchant) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(serialize(merchant));
});

/** PATCH /api/merchants/:id — update editable fields (code/password are immutable here). */
export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
    await requirePermission(req, "merchant", "update");
  const v = validateMerchantInput(await readJson(req));
  if (!v.ok) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: v.errors });
  }
  if (v.data.agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: v.data.agentId }, select: { id: true } });
    if (!agent) {
      throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { agentId: "invalid" } });
    }
  }
  const existing = await prisma.merchant.findUnique({ where: { id: params.id }, select: MERCHANT_SELECT });
  if (!existing) throw new ApiError(404, "not_found", "errors.notFound");
  const audit = await auditContextFromRequest(req);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.merchant.update({ where: { id: params.id }, data: toMerchantData(v.data), select: MERCHANT_SELECT });
    await recordAudit(tx, audit, { action: "merchant.update", targetType: "merchant", targetId: row.id, before: existing, after: row });
    return row;
  });
  return ok(serialize(updated));
});
