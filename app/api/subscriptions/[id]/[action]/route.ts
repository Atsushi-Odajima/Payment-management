import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { loadSubscription } from "@/lib/subscriptions/list";
import { applySubscriptionAction, chargeSubscription } from "@/lib/subscriptions/service";
import { isSubscriptionAction } from "@/lib/subscriptions/types";

/**
 * POST /api/subscriptions/:id/:action — charge (now; body { outcome?: success | failure }
 * to force the demo result) | pause | resume | cancel.
 */
export const POST = withApiHandler<{ params: { id: string; action: string } }>(async (req, { params }) => {
  if (!isSubscriptionAction(params.action)) throw new ApiError(404, "invalid_action", "errors.invalidAction");
  await requirePermission(req, "subscription", "action");
  const audit = await auditContextFromRequest(req);
  if (params.action === "charge") {
    const body = ((await readJson(req)) ?? {}) as { outcome?: string };
    const forceOutcome = body.outcome === "success" || body.outcome === "failure" ? body.outcome : undefined;
    const result = await chargeSubscription(prisma, { subscriptionId: params.id, audit, forceOutcome });
    return ok({ result, ...(await loadSubscription(params.id)) });
  }
  await applySubscriptionAction(prisma, { id: params.id, action: params.action, audit });
  return ok(await loadSubscription(params.id));
});
