import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { applyDepositDiffAction, isDepositDiffAction } from "@/lib/risk/deposit-diffs";
import { notifyDepositShort } from "@/lib/email/hooks";

/**
 * POST /api/deposit-diffs/:id/:action — refund (excess → refund request) |
 * notify (short → customer asked for the balance, email logged) | resolve.
 */
export const POST = withApiHandler<{ params: { id: string; action: string } }>(async (req, { params }) => {
  if (!isDepositDiffAction(params.action)) throw new ApiError(404, "invalid_action", "errors.invalidAction");
  const admin = await requirePermission(req, "deposit_diff", "update");
  const row = await applyDepositDiffAction(prisma, {
    paymentId: params.id,
    action: params.action,
    actor: { id: admin.id, role: admin.role },
    audit: await auditContextFromRequest(req),
    onNotify: (r) => notifyDepositShort(prisma, r.id),
  });
  return ok(row);
});
