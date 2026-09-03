import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { loadPlan, toPlanRow } from "@/lib/subscriptions/list";
import { updatePlan } from "@/lib/subscriptions/service";
import { planUpdateSchema } from "@/lib/subscriptions/types";

type Ctx = { params: { id: string } };

/** GET /api/plans/:id */
export const GET = withApiHandler<Ctx>(async (_req, { params }) => {
  const row = await loadPlan(params.id);
  if (!row) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(row);
});

/** PATCH /api/plans/:id — name / amount / interval / trial / active. */
export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
  await requirePermission(req, "plan", "update");
  const parsed = planUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const row = await updatePlan(prisma, { id: params.id, input: parsed.data, audit: await auditContextFromRequest(req) });
  return ok(toPlanRow(row));
});
