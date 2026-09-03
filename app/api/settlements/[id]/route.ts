import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { loadSettlement } from "@/lib/settlements/list";
import { deleteBatch } from "@/lib/settlements/service";

type Ctx = { params: { id: string } };

/** GET /api/settlements/:id — batch with lines. */
export const GET = withApiHandler<Ctx>(async (_req, { params }) => {
  const data = await loadSettlement(params.id);
  if (!data) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(data);
});

/** DELETE /api/settlements/:id — discard a batch that is still collecting (master). */
export const DELETE = withApiHandler<Ctx>(async (req, { params }) => {
  await requireMaster(req);
  await deleteBatch(prisma, { batchId: params.id, audit: await auditContextFromRequest(req) });
  return ok({ deleted: true });
});
