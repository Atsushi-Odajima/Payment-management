import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { merchantAuditContext, recordAudit, requestIp } from "@/lib/audit";
import { requireMerchant } from "@/lib/merchant-portal/session";
import { resendDelivery } from "@/lib/webhooks/deliver";

/** POST /api/merchant-portal/webhooks/:id/resend — the merchant re-sends one of its own deliveries now (audited, actor merchant). */
export const POST = withApiHandler<{ params: { id: string } }>(
  async (req, { params }) => {
    const merchant = await requireMerchant(prisma, req);
    const before = await prisma.webhookDelivery.findFirst({ where: { id: params.id, merchantId: merchant.id }, select: { id: true, status: true, attempts: true, event: true } });
    if (!before) throw new ApiError(404, "not_found", "errors.notFound");
    const result = await resendDelivery(prisma, before.id);
    await recordAudit(prisma, merchantAuditContext(merchant.id, requestIp(req)), {
      action: "webhook.resend",
      targetType: "webhook_delivery",
      targetId: before.id,
      before: { status: before.status, attempts: before.attempts },
      after: { status: result.status, attempts: before.attempts + 1, responseStatus: result.responseStatus, error: result.error, event: before.event },
    });
    return ok(result);
  },
  { ipRestricted: false },
);
