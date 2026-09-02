import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { applyPaymentAction } from "@/lib/payments/actions";
import { UI_ACTIONS, isPaymentAction } from "@/lib/payments/transitions";

const RefundBody = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.string().max(500).nullable().optional(),
});

/**
 * POST /api/payments/:id/:action   (action = capture | cancel | refund)
 *
 * Every action goes through applyPaymentAction, which enforces the state
 * machine with a status-conditioned updateMany and writes a PaymentEvent.
 */
export const POST = withApiHandler<{ params: { id: string; action: string } }>(
  async (req, { params }) => {
    if (!isPaymentAction(params.action) || !UI_ACTIONS.includes(params.action)) {
      throw new ApiError(404, "invalid_action", "errors.invalidAction");
    }
    const body = params.action === "refund" ? RefundBody.parse(await readJson(req)) : {};
    const result = await applyPaymentAction(prisma, {
      paymentId: params.id,
      action: params.action,
      amount: body.amount,
      reason: body.reason ?? null,
      actor: "dashboard",
    });
    return ok(result);
  },
);
