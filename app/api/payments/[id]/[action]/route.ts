import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { applyPaymentAction } from "@/lib/payments/actions";
import { MASTER_ACTIONS, UI_ACTIONS, isPaymentAction } from "@/lib/payments/transitions";
import { auditContextFromRequest } from "@/lib/audit";

const RefundBody = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.string().max(500).nullable().optional(),
});

const DepositBody = z.object({
  amount: z.number().int().positive().max(99_999_999),
});

/**
 * POST /api/payments/:id/:action
 *   action = capture | cancel | refund | fail | expire | deposit
 *
 * Application-stage actions (everything but refund) require the master role.
 * Every action goes through applyPaymentAction, which enforces the state
 * machine with a status-conditioned updateMany and writes a PaymentEvent.
 */
export const POST = withApiHandler<{ params: { id: string; action: string } }>(
  async (req, { params }) => {
    if (!isPaymentAction(params.action) || !UI_ACTIONS.includes(params.action)) {
      throw new ApiError(404, "invalid_action", "errors.invalidAction");
    }
    if (MASTER_ACTIONS.includes(params.action)) await requireMaster(req);

    let amount: number | undefined;
    let reason: string | null = null;
    if (params.action === "refund") {
      const body = RefundBody.parse(await readJson(req));
      amount = body.amount;
      reason = body.reason ?? null;
    } else if (params.action === "deposit") {
      amount = DepositBody.parse(await readJson(req)).amount;
    }

    const result = await applyPaymentAction(prisma, {
      paymentId: params.id,
      action: params.action,
      amount,
      reason,
      actor: "dashboard",
      audit: await auditContextFromRequest(req),
    });
    return ok(result);
  },
);
