import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";
import { resendDelivery } from "@/lib/webhooks/deliver";

/** POST /api/webhook-logs/:id/resend — master: send again now (recorded as a new attempt, audited). */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  await requireMaster(req);
  const before = await prisma.webhookDelivery.findUnique({ where: { id: params.id }, select: { id: true, status: true, attempts: true, merchantId: true, event: true } });
  if (!before) throw new ApiError(404, "not_found", "errors.notFound");
  const result = await resendDelivery(prisma, before.id);
  await recordAudit(prisma, await auditContextFromRequest(req), {
    action: "webhook.resend",
    targetType: "webhook_delivery",
    targetId: before.id,
    before: { status: before.status, attempts: before.attempts },
    after: { status: result.status, attempts: before.attempts + 1, responseStatus: result.responseStatus, error: result.error, event: before.event },
  });
  return ok(result);
});
