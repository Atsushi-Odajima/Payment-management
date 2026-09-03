import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { loadPlans, toPlanRow } from "@/lib/subscriptions/list";
import { createPlan } from "@/lib/subscriptions/service";
import { planInputSchema } from "@/lib/subscriptions/types";

/** GET /api/plans — every billing plan. */
export const GET = withApiHandler(async () => ok({ plans: await loadPlans() }));

/** POST /api/plans — create a plan for a merchant. */
export const POST = withApiHandler(async (req) => {
  await requirePermission(req, "plan", "create");
  const parsed = planInputSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const row = await createPlan(prisma, { input: parsed.data, audit: await auditContextFromRequest(req) });
  return ok(toPlanRow(row), { status: 201 });
});
