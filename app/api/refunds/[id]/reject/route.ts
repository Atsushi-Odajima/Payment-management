import { prisma } from "@/lib/db";
import { ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { rejectRefund } from "@/lib/refunds/service";
import { refundDecisionSchema } from "@/lib/refunds/types";

/** POST /api/refunds/:id/reject — master: decline a pending request. */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  const admin = await requireMaster(req);
  const { note } = refundDecisionSchema.parse((await readJson(req).catch(() => ({}))) ?? {});
  const row = await rejectRefund(prisma, { refundId: params.id, actor: { id: admin.id, role: admin.role }, note, audit: await auditContextFromRequest(req) });
  return ok(row);
});
