import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";
import { TERMS_LIMITS } from "@/lib/merchants/terms";

type Ctx = { params: { id: string } };

const Body = z.object({
  transferDueDays: z.number().int().min(TERMS_LIMITS.transferDueDays.min).max(TERMS_LIMITS.transferDueDays.max),
  refundWindowDays: z.number().int().min(TERMS_LIMITS.refundWindowDays.min).max(TERMS_LIMITS.refundWindowDays.max),
});

/** PATCH /api/merchants/:id/terms — transfer deadline days and refund window days (B-3). */
export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
  await requirePermission(req, "merchant_contract", "update");
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), "range"])) });
  const existing = await prisma.merchant.findUnique({ where: { id: params.id }, select: { transferDueDays: true, refundWindowDays: true } });
  if (!existing) throw new ApiError(404, "not_found", "errors.notFound");
  const audit = await auditContextFromRequest(req);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.merchant.update({ where: { id: params.id }, data: parsed.data, select: { transferDueDays: true, refundWindowDays: true } });
    await recordAudit(tx, audit, { action: "merchant.terms_update", targetType: "merchant", targetId: params.id, before: existing, after: row });
    return row;
  });
  return ok(updated);
});
