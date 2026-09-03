import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { renotifyPayment } from "@/lib/deposits/service";

/**
 * POST /api/payments/:id/renotify — API re-notify: send payment.completed to the
 * merchant again for a completed bank transfer (e.g. after support attached a
 * forgotten transfer id, or the merchant lost the first notification). Bank
 * transfers only; master role like the other transaction-state operations.
 */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  await requireMaster(req);
  return ok(await renotifyPayment(prisma, { paymentId: params.id, audit: await auditContextFromRequest(req) }));
});
