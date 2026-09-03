import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { loadRefund } from "@/lib/refunds/list";

/** GET /api/refunds/:id */
export const GET = withApiHandler<{ params: { id: string } }>(async (_req, { params }) => {
  const row = await loadRefund(params.id);
  if (!row) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(row);
});
